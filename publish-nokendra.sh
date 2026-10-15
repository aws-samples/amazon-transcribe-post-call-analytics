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

# Set architecture for npm/node, and require a Node version the dependencies support.
#
# These checks were previously present only in publish.sh, so the no-Kendra path could
# be built on an unsupported toolchain with no warning. The floor is 20 because the AWS
# SDK for JavaScript v3 packages declare engines.node ">=20.0.0", and npm only warns on
# an engine mismatch rather than failing.
export npm_config_arch=x64
alias npm="arch -x86_64 npm"
alias node="arch -x86_64 node"

if ! [ -x "$(command -v npm)" ]; then
  echo 'Error: npm is not installed and required.' >&2
  exit 1
fi

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

# npm ci rather than npm install - see the equivalent comment in publish.sh. In short:
# npm install treats the lockfile as advisory and may resolve and write newer versions,
# so a release build would not necessarily ship the tree that was reviewed. The
# "|| exit 1" matters too; the previous calls had none, so a failed install did not stop
# the build.
#
# --omit=dev where the directory itself becomes the deployed artifact - see the fuller
# comment in publish.sh. In short: cloudformation package zips the whole CodeUri
# directory including node_modules, so devDependencies would otherwise ship to Lambda.
# pca-ui/src/www is the exception, because react-scripts is needed to build it and only
# the resulting build/ directory is packaged.
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

# Full install - react-scripts is a devDependency and the build needs it. Only build/
# is packaged, so this node_modules never ships.
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

# Build embedded QuickSight dashboards project
cp pca-dashboards/pca-dashboards.yaml build/pca-dashboards.yaml

echo "Packaging Cfn artifacts"
aws cloudformation package --template-file pca-main-nokendra.template --output-template-file build/packaged.template --s3-bucket ${BUCKET} --s3-prefix ${PREFIX_AND_VERSION} --region ${region}|| exit 1
aws s3 cp build/packaged.template "s3://${BUCKET}/${PREFIX}/pca-main.yaml" || exit 1

if $PUBLIC; then
  echo "Enabling ACLs on bucket"
  aws s3api put-public-access-block --bucket ${BUCKET} --public-access-block-configuration "BlockPublicPolicy=false"
  aws s3api put-bucket-ownership-controls --bucket ${BUCKET} --ownership-controls="Rules=[{ObjectOwnership=BucketOwnerPreferred}]"
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
echo CLI Deploy: aws cloudformation deploy --template-file `pwd`/build/packaged.template --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --stack-name PCA --parameter-overrides AdminEmail=johndoe@example.com

echo Done
exit 0

