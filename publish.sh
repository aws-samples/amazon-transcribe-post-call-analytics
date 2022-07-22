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
npm run build
popd

# Build and deploy embedded MediaSearch project
pushd aws-kendra-transcribe-media-search
if $PUBLIC; then
  ./publish.sh ${BUCKET} ${PREFIX_AND_VERSION}/mediasearch | tee /tmp/mediasearch.out
else
   ./publish-privatebucket.sh ${BUCKET} ${PREFIX_AND_VERSION}/mediasearch | tee /tmp/mediasearch.out
fi
popd
mediasearch_template="s3://${BUCKET}/${PREFIX_AND_VERSION}/mediasearch/msfinder.yaml"
aws s3 cp $mediasearch_template build/pca-mediasearch-finder.yaml


echo "Downloading witch file and upload into artifacts bucket"
curl https://saes-prod-us-east-1.s3.us-east-1.amazonaws.com/witch-0eabcaf.zip -o /tmp/witch-0eabcaf.zip
WITCHKEY=${PREFIX_AND_VERSION}/witch-0eabcaf.zip
aws s3 cp /tmp/witch-0eabcaf.zip s3://${BUCKET}/${WITCHKEY} || exit 1

echo "Packaging Cfn artifacts"
aws cloudformation package --template-file pca-main.template --output-template-file /tmp/packaged.template --s3-bucket ${BUCKET} --s3-prefix ${PREFIX_AND_VERSION} --region ${region}|| exit 1

echo "Inline edit tmp/packaged.template to replace "
echo "   <ARTIFACT_BUCKET_TOKEN> with bucket name: $BUCKET"
echo "   <WITCHKEY_TOKEN> with prefix: $WITCHKEY"
cat /tmp/packaged.template | 
sed -e "s%<ARTIFACT_BUCKET_TOKEN>%$BUCKET%g" | 
sed -e "s%<WITCHKEY_TOKEN>%$WITCHKEY%g" > build/packaged.template

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
echo CLI Deploy: aws cloudformation deploy --template-file `pwd`/build/packaged.template --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND --stack-name PostCallAnalytics --parameter-overrides AdminEmail=johndoe@example.com

echo Done
exit 0

