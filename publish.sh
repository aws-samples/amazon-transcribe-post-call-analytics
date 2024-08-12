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

if ! [ -x "$(command -v npm)" ]; then
  echo 'Error: npm is not installed and required.' >&2
  exit 1
fi
if ! node -v | grep -qF "v18."; then
    echo 'Error: Node.js version 18.x is not installed and required.' >&2
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

echo "Getting package dependencies"
pushd pca-server/src/trigger
npm install
popd
# Not required, no additional server libraries to package
# pushd pca-server/src/pca
# pip install -r requirements.txt -t .
# popd
pushd pca-ui/src/lambda
npm install
popd

pushd pca-ui/src/www
npm install
npm run build || exit 1
popd

pushd pca-ui/src/witch
npm install
npm run build || exit 1
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
echo CLI Deploy: aws cloudformation deploy --template-file `pwd`/build/packaged.template --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --stack-name PCA --parameter-overrides AdminEmail=johndoe@example.com

echo Done
exit 0

