# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2022-08-23
### Fixed
- Support nested folders in bulk workflow

## [0.3.0] - 2022-08-12
### Added
- Initial processing for Genesys CTR telephony files. See [Integration with Telephony CTR Files](./README.md#integration-with-telephony-ctr-files)
### Fixed
- Stack outputs `RolesForKMSKey` - Replace incorrect function ARN with Role Arn for BulkMoveFiles, and added BulkFilesCount

## [0.2.5] - 2022-07-05
### Fixed
- Stack failure when 'loadSampleAudioFiles` set to `false` 

## [0.2.4] - 2022-06-10
### Fixed
- Use sigv4 for S3 presignedURLS
- New stack output with list of role ARNS thta need access KMS key (if any) used to encrypt S3 InputBucket, OutputBucket, or BulkUploadBucket

## [0.2.3] - 2022-06-09
### Fixed
- Simplifies workflow by using new Transcribe API to specify Custom Vocabulary and Vocabulary Filter at the same time as using Language ID.

## [0.2.2] - 2022-06-01
### Fixed
- Replaces ':' with '-' when constructing Transcribe job name. Note, use '-' instead of ':' in any custom regex patterns specified in CF parameter, as regex is applied to the generated job name after replacement.

## [0.2.1] - 2022-04-20
### Fixed
- supports audio files placed in subfolders under IngestBucket path. Replaces '/' with '-' when constructing job name. 

## [0.2.0] - 2022-03-22
### Added
- add support for Transcribe Call Analytics call summarization (ActionItems, Outcomes)
### Fixed
- fix "Load more" button on PCA Home page

## [0.1.4] - 2022-03-06
### Fixed
- fix content security policy for S3 bucket url used to access recordings in the UI for non us-east-1 regions
- add new Filename Regex to keep track of calls from a particular Customer, or a caller's name or ID. Similar to AGENT and GUID. This also adds the additional structure to the pca glue catalog, so that a query can be used to group calls by CUST.
- add CloudFormation parameter pattern rules to defend against reported instances of browser autofill populating BulkUploadStepFunctionName and ConversationLocation parameters with user's first & last name, causing subsequent stack failure.
- merge dependabot PRs


## [0.1.3] - 2022-02-19
### Fixed
- Fix deployment failure for regions other than us-east-1
- Fix template validation failures when publishing in regions where Amazon Kendra is not supported

## [0.1.2] - 2022-01-14
### Fixed
- Specify a manifest-src in the content security policy.
- Fix broken image link in call detail page for recordings processed by Transcribe standard (not Call Analytics)

## [0.1.1] - 2022-01-07
### Fixed
- Athena queries broken due to image storage path
- Recordings processed by Transcribe standard (not Call Analytics) fail to show up in the UI 

## [0.1.0] - 2021-12-17
### Added
- Initial release

[Unreleased]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/compare/v0.3.1...develop
[0.3.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.1
[0.3.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.3.0
[0.2.5]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.5
[0.2.4]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.4
[0.2.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.3
[0.2.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.2
[0.2.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.1
[0.2.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.2.0
[0.1.4]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.4
[0.1.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.3
[0.1.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.2
[0.1.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.1
[0.1.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/0.1.0
