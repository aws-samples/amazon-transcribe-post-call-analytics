# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2022-01-14
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

[Unreleased]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/compare/v0.1.3...develop
[0.1.3]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.3
[0.1.2]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.2
[0.1.1]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/v0.1.1
[0.1.0]: https://github.com/aws-samples/amazon-transcribe-post-call-analytics/releases/tag/0.1.0
