#!/bin/bash

##############################################################################################
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
##############################################################################################

##############################################################################################
# Create new Cfn artifacts bucket if not already existing
# Modify templates to reference new bucket names and prefixes
# create lambda zipfiles with timestamps to ensure redeployment on stack update
# Upload templates to S3 bucket
#
# To deploy to non-default region, set AWS_DEFAULT_REGION to supported region
# See: https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ - E.g.
# export AWS_DEFAULT_REGION=eu-west-1
##############################################################################################

# Set architecture for npm/node
export npm_config_arch=x64
alias npm="arch -x86_64 npm"
alias node="arch -x86_64 node"

if ! [ -x "$(command -v npm)" ]; then
  echo 'Error: npm is not installed and required.' >&2
  exit 1
fi

# Check for Node.js version 20 or newer.
#
# Raised from 18: the AWS SDK for JavaScript v3 packages this project depends on declare
# engines.node ">=20.0.0". npm only warns about an engine mismatch rather than failing,
# so an 18 build would have installed and then misbehaved at runtime instead of stopping
# here.
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
    echo 'Error: Node.js version 20 or newer is required.' >&2
    exit 1
fi


USAGE="$0 <cfn_bucket> <cfn_prefix> [public]"

BUCKET=$1
[ -z "$BUCKET" ] && echo "Cfn bucket name is required parameter. Usage $USAGE" && exit 1

PREFIX=$2
[ -z "$PREFIX" ] && echo "Prefix is required parameter. Usage $USAGE" && exit 1

# Remove trailing slash from prefix if needed
[[ "${PREFIX}" == */ ]] && PREFIX="${PREFIX%?}"

# Append VERSION
VERSION=$(cat ./VERSION)
PREFIX_AND_VERSION=${PREFIX}/${VERSION}

ACL=$3
if [ "$ACL" == "public" ]; then
  echo "Published S3 artifacts will be acessible by public (read-only)"
  PUBLIC=true
else
  echo "Published S3 artifacts will NOT be acessible by public."
  PUBLIC=false
fi
  
# Create bucket if it doesn't already exist
aws s3api list-buckets --query 'Buckets[].Name' | grep "\"$BUCKET\"" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Creating s3 bucket: $BUCKET"
  aws s3 mb s3://${BUCKET} || exit 1
  aws s3api put-bucket-versioning --bucket ${BUCKET} --versioning-configuration Status=Enabled || exit 1
else
  echo "Using existing bucket: $BUCKET"
fi

# get bucket region for owned accounts
region=$(aws s3api get-bucket-location --bucket $BUCKET --query "LocationConstraint" --output text) || region="us-east-1"
[ -z "$region" -o "$region" == "None" ] && region=us-east-1;
echo "Bucket in region: $region"

# create build dir if it doesn't exist
mkdir -p build

# npm ci rather than npm install, in all four components below.
#
# npm install treats the lockfile as advisory: it will happily resolve a newer version
# that satisfies a caret range and rewrite package-lock.json while doing it. That means
# the dependency tree in a release build is not necessarily the tree that was reviewed
# or audited. npm ci installs exactly what the lockfile pins and fails if the lockfile
# and package.json disagree.
#
# Each call also now has "|| exit 1". The previous npm install calls had none, so a
# failed dependency install did not stop the build - it carried on and packaged
# whatever happened to be on disk.
#
# --omit=dev where the directory itself becomes the deployed artifact.
#
# "aws cloudformation package" zips the whole CodeUri directory, node_modules included,
# so anything installed here ships to Lambda. Installing devDependencies therefore put
# the entire jest tree - 344 packages, 46 MB, and every one of the dev-only CVE findings
# npm reports during this install - inside the deployed function package. Prod-only
# brings pca-ui/src/lambda down to 46 packages and 17.8 MB with no findings.
#
# Note pca-ui/src/www below is deliberately NOT --omit=dev: react-scripts is a
# devDependency and is needed to produce the build, and only the resulting build/
# directory is packaged, never that component's node_modules.
echo "Getting package dependencies"
pushd pca-server/src/trigger
npm ci --omit=dev || exit 1
popd
# Not required, no additional server libraries to package
# pushd pca-server/src/pca
# pip install -r requirements.txt -t .
# popd
pushd pca-ui/src/lambda
npm ci --omit=dev || exit 1
popd

# Full install here, including devDependencies - react-scripts is one, and the build
# below needs it. Only build/ is packaged, so this node_modules never ships.
pushd pca-ui/src/www
npm ci || exit 1
npm run build || exit 1
popd

# witch's build copies node_modules into the layer zip, so prod-only matters here too.
pushd pca-ui/src/witch
npm ci --omit=dev || exit 1
npm run build || exit 1
popd

# Build the ffmpeg Lambda layer from a pinned, SHA256-verified upstream tarball.
# Previously a CloudFormation custom resource downloaded this during stack creation with no
# integrity check; doing it here means a bad download fails the release build rather than a
# customer's deployment. See pca-server/src/ffmpeg/build-ffmpeg-layer.sh.
echo "Building ffmpeg layer"
pushd pca-server/src/ffmpeg
# Invoked via bash rather than as ./build-ffmpeg-layer.sh so this does not depend on the
# execute bit surviving a checkout. Contributors on Windows commonly have
# core.fileMode=false, which drops it silently.
bash ./build-ffmpeg-layer.sh || exit 1
popd

# Build and deploy embedded MediaSearch project
echo "Initialize and update git submodules"
git submodule init
git submodule update
echo "Applying patch files to enable link to PCA Call Analysis"
# add PCA call detail link to results page
cp -v ./patches/mediasearch/ResultFooter.tsx submodule-mediasearch/finderapp/src/search/resultsPanel/components/ResultFooter.tsx
pushd submodule-mediasearch
if $PUBLIC; then
  echo "Enabling ACLs on bucket"
  aws s3api put-public-access-block --bucket ${BUCKET} --public-access-block-configuration "BlockPublicPolicy=false"
  aws s3api put-bucket-ownership-controls --bucket ${BUCKET} --ownership-controls="Rules=[{ObjectOwnership=BucketOwnerPreferred}]"
  ./publish.sh ${BUCKET} ${PREFIX_AND_VERSION}/mediasearch public | tee /tmp/mediasearch.out || exit 1
else
   ./publish.sh ${BUCKET} ${PREFIX_AND_VERSION}/mediasearch private | tee /tmp/mediasearch.out || exit 1
fi
popd
mediasearch_template="s3://${BUCKET}/${PREFIX_AND_VERSION}/mediasearch/msfinder.yaml"
aws s3 cp $mediasearch_template build/pca-mediasearch-finder.yaml

# Build embedded QuickSight dashboards project
cp pca-dashboards/pca-dashboards.yaml build/pca-dashboards.yaml

echo "Packaging Cfn artifacts"
aws cloudformation package --template-file pca-main.template --output-template-file build/packaged.template --s3-bucket ${BUCKET} --s3-prefix ${PREFIX_AND_VERSION} --region ${region}|| exit 1

aws s3 cp build/packaged.template "s3://${BUCKET}/${PREFIX}/pca-main.yaml" || exit 1

if $PUBLIC; then
  echo "Setting public read ACLs on published artifacts"
  files=$(aws s3api list-objects --bucket ${BUCKET} --prefix ${PREFIX_AND_VERSION} --query "(Contents)[].[Key]" --output text)
  for file in $files
    do
    aws s3api put-object-acl --acl public-read --bucket ${BUCKET} --key $file
    done
  aws s3api put-object-acl --acl public-read --bucket ${BUCKET} --key ${PREFIX}/pca-main.yaml
fi


echo "Validating Cfn artifacts"
template="https://s3.${region}.amazonaws.com/${BUCKET}/${PREFIX}/pca-main.yaml"
aws cloudformation validate-template --template-url $template > /dev/null || exit 1


echo "Outputs"
echo Template URL: $template
echo CF Launch URL: https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/review?templateURL=${template}\&stackName=PCA
echo CLI Deploy: aws cloudformation deploy --template-file `pwd`/build/packaged.template --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --stack-name PCA --parameter-overrides AdminEmail=YOUR_EMAIL

echo Done
exit 0

