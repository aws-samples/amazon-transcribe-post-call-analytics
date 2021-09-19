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
# To deploy to non-default region, set AWS_DEFAULT_REGION to region supported by Amazon Kendra
# See: https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/ - E.g.
# export AWS_DEFAULT_REGION=eu-west-1
##############################################################################################

USAGE="$0 cfn_bucket cfn_prefix [dflt_media_bucket] [dflt_media_prefix] [dflt_metadata_prefix] [dflt_options_prefix]"

BUCKET=$1
[ -z "$BUCKET" ] && echo "Cfn bucket name is required parameter. Usage $USAGE" && exit 1

PREFIX=$2
[ -z "$PREFIX" ] && echo "Prefix is required parameter. Usage $USAGE" && exit 1

SAMPLES_BUCKET=$3
SAMPLES_PREFIX=$4
METADATA_PREFIX=$5
OPTIONS_PREFIX=$6

# Add trailing slash to prefix if needed
[[ "${PREFIX}" != */ ]] && PREFIX="${PREFIX}/"


# Create bucket if it doesn't already exist
aws s3api list-buckets --query 'Buckets[].Name' | grep "\"$BUCKET\"" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Creating s3 bucket: $BUCKET"
  aws s3 mb s3://${BUCKET} || exit 1
  aws s3api put-bucket-versioning --bucket ${BUCKET} --versioning-configuration Status=Enabled || exit 1
else
  echo "Using existing bucket: $BUCKET"
fi

echo -n "Make temp dir: "
timestamp=$(date "+%Y%m%d_%H%M")
tmpdir=/tmp/mediasearch
[ -d /tmp/mediasearch ] && rm -fr /tmp/mediasearch
mkdir -p $tmpdir
pwd

echo "Create timestamped zipfile for lambdas"
# indexer
indexerzip=indexer_$timestamp.zip
pushd lambda/indexer
zip -r $tmpdir/$indexerzip *.py
popd
# build-trigger
buildtriggerzip=buildtrigger_$timestamp.zip
pushd lambda/build-trigger
zip -r $tmpdir/$buildtriggerzip *.py
popd
# token-enabler
tokenenablerzip=tokenenabler_$timestamp.zip
pushd lambda/token-enabler
zip -r $tmpdir/$tokenenablerzip *.py
popd

echo "Create zipfile for AWS Amplify/CodeCommit"
finderzip=finder_$timestamp.zip
zip -r $tmpdir/$finderzip ./* -x "node_modules*"

# get bucket region for owned accounts
region=$(aws s3api get-bucket-location --bucket $BUCKET --query "LocationConstraint" --output text) || region="us-east-1"
[ -z "$region" -o "$region" == "None" ] && region=us-east-1;

echo "Inline edit Cfn templates to replace "
echo "   <ARTIFACT_BUCKET_TOKEN> with bucket name: $BUCKET"
echo "   <ARTIFACT_PREFIX_TOKEN> with prefix: $PREFIX"
echo "   <INDEXER_ZIPFILE> with zipfile: $indexerzip"
echo "   <BUILDTRIGGER_ZIPFILE> with zipfile: $buildtriggerzip"
echo "   <FINDER_ZIPFILE> with zipfile: $finderzip"
echo "   <TOKEN_ENABLER_ZIPFILE> with zipfile: $tokenenablerzip"
echo "   <REGION> with region: $region"
[ -z "$SAMPLES_BUCKET" ] || echo "   <SAMPLES_BUCKET> with bucket name: $SAMPLES_BUCKET"
[ -z "$SAMPLES_PREFIX" ] || echo "   <SAMPLES_PREFIX> with prefix: $SAMPLES_PREFIX"
[ -z "$METADATA_PREFIX" ] || echo "   <METADATA_PREFIX> with prefix: $METADATA_PREFIX"
[ -z "$OPTIONS_PREFIX" ] || echo "   <OPTIONS_PREFIX> with prefix: $OPTIONS_PREFIX"
for template in msindexer.yaml msfinder.yaml
do
   echo preprocessing $template
   cat cfn-templates/$template | 
    sed -e "s%<ARTIFACT_BUCKET_TOKEN>%$BUCKET%g" | 
    sed -e "s%<ARTIFACT_PREFIX_TOKEN>%$PREFIX%g" |
    sed -e "s%<INDEXER_ZIPFILE>%$indexerzip%g" |
    sed -e "s%<BUILDTRIGGER_ZIPFILE>%$buildtriggerzip%g" |
    sed -e "s%<FINDER_ZIPFILE>%$finderzip%g" |
    sed -e "s%<TOKEN_ENABLER_ZIPFILE>%$tokenenablerzip%g" |
    sed -e "s%<SAMPLES_BUCKET>%$SAMPLES_BUCKET%g" |
    sed -e "s%<SAMPLES_PREFIX>%$SAMPLES_PREFIX%g" |
    sed -e "s%<METADATA_PREFIX>%$METADATA_PREFIX%g" |
    sed -e "s%<OPTIONS_PREFIX>%$OPTIONS_PREFIX%g" |
    sed -e "s%<REGION>%$region%g" > $tmpdir/$template
done

S3PATH=s3://$BUCKET/$PREFIX
echo "Copy $tmpdir/* to $S3PATH/"
for f in msfinder.yaml msindexer.yaml $indexerzip $buildtriggerzip $finderzip $tokenenablerzip
do
aws s3 cp ${tmpdir}/${f} ${S3PATH}${f} --acl public-read || exit 1
done

# get default media bucket region and warn if it is different than Cfn bucket region
# media bucket must be in the same region as deployed stack (or Transcribe jobs fail)
if [ ! -z "$SAMPLES_BUCKET" ]; then
    dflt_media_region=$(aws s3api get-bucket-location --bucket $SAMPLES_BUCKET --query "LocationConstraint" --output text) || dflt_media_region="us-east-1"
    [ -z "dflt_media_region" -o "dflt_media_region" == "None" ] && dflt_media_region=us-east-1;
    if [ "$dflt_media_region" != "$region" ]; then
        echo "WARNING!!! Default media bucket region ($dflt_media_region) does not match deployment bucket region ($region).. Media bucket ($SAMPLES_BUCKET) must be in same region as deployment bucket ($BUCKET)"
    fi
fi

echo "Outputs"
indexer_template="https://s3.${region}.amazonaws.com/${BUCKET}/${PREFIX}msindexer.yaml"
finder_template="https://s3.${region}.amazonaws.com/${BUCKET}/${PREFIX}msfinder.yaml"
echo Indexer Template URL: $indexer_template
echo Finder Template URL: $finder_template
echo Indexer - CF Launch URL: https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/review?templateURL=${indexer_template}\&stackName=MediaSearch-Indexer
echo Finder - CF Launch URL: https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/review?templateURL=${finder_template}\&stackName=MediaSearch-Finder

echo Done
exit 0

