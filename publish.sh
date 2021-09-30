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

USAGE="$0 <cfn_bucket> <cfn_prefix> [public]"

BUCKET=$1
[ -z "$BUCKET" ] && echo "Cfn bucket name is required parameter. Usage $USAGE" && exit 1

PREFIX=$2
[ -z "$PREFIX" ] && echo "Prefix is required parameter. Usage $USAGE" && exit 1

# Remove trailing slash from prefix if needed
[[ "${PREFIX}" == */ ]] && PREFIX="${PREFIX%?}"

ACL=$3
if [ "$ACL" == "public" ]; then
  echo "Published S3 artifacts will be acessible by public (read-only)"
  PUBLIC=true
else
  echo "Published S3 artifacts will NOT be acessible by public."
  PUBLIC=false
fi
  

# get bucket region for owned accounts
region=$(aws s3api get-bucket-location --bucket $BUCKET --query "LocationConstraint" --output text) || region="us-east-1"
[ -z "$region" -o "$region" == "None" ] && region=us-east-1;
echo "Bucket in region: $region"

# Create bucket if it doesn't already exist
aws s3api list-buckets --query 'Buckets[].Name' | grep "\"$BUCKET\"" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Creating s3 bucket: $BUCKET"
  aws s3 mb s3://${BUCKET} || exit 1
  aws s3api put-bucket-versioning --bucket ${BUCKET} --versioning-configuration Status=Enabled || exit 1
else
  echo "Using existing bucket: $BUCKET"
fi

# create build dir if it doesn't exist
mkdir -p build

echo "Getting package dependencies"
pushd pca-server/src/trigger
npm install
popd
# no need to install python packages.. only boto3 and it's included in Lambda runtime
pushd pca-ui/src/lambda
npm install
popd

# Build and deploy embedded MediaSearch project
pushd aws-kendra-transcribe-media-search
if $PUBLIC; then
  ./publish.sh ${BUCKET} ${PREFIX}/mediasearch | tee /tmp/mediasearch.out
else
   ./publish-privatebucket.sh ${BUCKET} ${PREFIX}/mediasearch | tee /tmp/mediasearch.out
fi
popd
mediasearch_template="s3://${BUCKET}/${PREFIX}/mediasearch/msfinder.yaml"
aws s3 cp $mediasearch_template build/pca-mediasearch-finder.yaml


echo "Packaging Cfn artifacts"
aws cloudformation package --template-file pca-main.template --output-template-file build/packaged.template --s3-bucket ${BUCKET} --s3-prefix ${PREFIX} || exit 1
aws s3 cp build/packaged.template s3://${BUCKET}/${PREFIX}/pca-main.yaml || exit 1

if $PUBLIC; then
  echo "Setting public read ACLs on published artifacts"
  files=$(aws s3api list-objects --bucket ${BUCKET} --prefix ${PREFIX} --query "(Contents)[].[Key]" --output text)
  for file in $files
    do
    aws s3api put-object-acl --acl public-read --bucket ${BUCKET} --key $file
    done
fi


echo "Validating Cfn artifacts"
template="https://s3.${region}.amazonaws.com/${BUCKET}/${PREFIX}/pca-main.yaml"
aws cloudformation validate-template --template-url $template > /dev/null || exit 1


echo "Outputs"
echo Template URL: $template
echo CF Launch URL: https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/review?templateURL=${template}\&stackName=PostCallAnalytics
echo CLI Deploy: aws cloudformation deploy --template-file `pwd`/packaged.template --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --stack-name PostCallAnalytics --parameter-overrides AdminEmail=johndoe@example.com

echo Done
exit 0

