#!/bin/bash

##############################################################################################
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
##############################################################################################

##############################################################################################
# Builds the ffmpeg Lambda layer zip at PUBLISH time.
#
# Replaces an earlier design in which a CloudFormation custom resource downloaded this
# tarball from the public internet while the stack was being created, with no integrity
# check of any kind. That meant:
#   - the deployed binary was whatever the URL happened to serve on the day,
#   - a failed or substituted download surfaced to the customer deploying the stack,
#   - and the processing Lambdas needed a route to the internet at deploy time.
#
# Doing it here instead means the artifact is fetched once over HTTPS, checked against a
# pinned digest, and shipped as a normal published asset. A bad or unexpected download now
# fails the release build, in front of the person cutting the release, rather than in a
# customer's account.
#
# Output: build/ffmpeg.zip, laid out as bin/ffmpeg and bin/ffprobe. A Lambda layer unpacks
# to /opt, so the binaries land in /opt/bin, which is already on the runtime PATH. That is
# what lets the Python code in pca-server/src/pca call bare "ffmpeg" and "ffprobe". Do not
# change this layout without changing those call sites.
#
# Usage: ./build-ffmpeg-layer.sh
##############################################################################################

set -euo pipefail

##############################################################################################
# Pinned artifact. To move to a different ffmpeg build, change all three values together and
# record the reason in docs/security-findings.md.
#
# Obtain the digest by downloading the tarball and running:
#   shasum -a 256 <file>     # macOS
#   sha256sum <file>         # Linux
#
# Upstream publishes only an MD5 digest, which is why the expected SHA256 is pinned here
# rather than fetched alongside the download. A digest fetched from the same host over the
# same connection as the artifact is not an independent check.
#
# Known digests for this source, for reference when changing version:
#   4.4    ccac14abf72e8a451d823ed09b1ea953b0bdf2814ab10fc153c753afd5fb0a20  (deployed before this change)
#   7.0.2  abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67  (pinned below)
#
# Note on the URL: 7.0.2 is only published at the unversioned "release" path, because
# upstream's old-releases directory stops at 6.0.1. So this URL's contents will change when
# upstream eventually publishes a newer build, and the digest check below will then fail the
# build on purpose. That is the intended behaviour: it forces a deliberate look at a new
# binary instead of silently shipping it. If you would rather have a URL whose contents can
# never move, pin 6.0.1 from old-releases instead and accept the older build.
#
# Replacing this source entirely is tracked as TD-1 in docs/technical-debt.md.
##############################################################################################
FFMPEG_VERSION="7.0.2"
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
FFMPEG_SHA256="abda8d77ce8309141f83ab8edf0596834087c52467f6badf376a6a2a4c87cf67"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
CACHE_DIR="${SCRIPT_DIR}/.cache"
TARBALL="${CACHE_DIR}/ffmpeg-${FFMPEG_VERSION}-amd64-static.tar.xz"
ZIP_PATH="${BUILD_DIR}/ffmpeg.zip"

# macOS ships shasum, most Linux images ship sha256sum. Support both rather than assuming.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Error: neither sha256sum nor shasum found; cannot verify the download." >&2
    exit 1
  fi
}

for tool in curl tar zip; do
  if ! [ -x "$(command -v ${tool})" ]; then
    echo "Error: ${tool} is not installed and is required to build the ffmpeg layer." >&2
    exit 1
  fi
done

mkdir -p "${BUILD_DIR}" "${CACHE_DIR}"

# Reuse a previously downloaded tarball only when it still matches the pinned digest, so
# re-running is cheap but never trusts a cached file blindly.
if [ -f "${TARBALL}" ] && [ "$(sha256_of "${TARBALL}")" == "${FFMPEG_SHA256}" ]; then
  echo "Using verified cached ffmpeg tarball: ${TARBALL}"
else
  echo "Downloading ffmpeg ${FFMPEG_VERSION} from ${FFMPEG_URL}"
  rm -f "${TARBALL}"
  # --fail so an HTML error page is never mistaken for an archive. --location to follow
  # redirects, but note the pinned URL is already https.
  curl --fail --silent --show-error --location --output "${TARBALL}" "${FFMPEG_URL}"

  ACTUAL_SHA256="$(sha256_of "${TARBALL}")"
  if [ "${ACTUAL_SHA256}" != "${FFMPEG_SHA256}" ]; then
    echo "" >&2
    echo "Error: ffmpeg download failed its integrity check. Refusing to build the layer." >&2
    echo "  url      ${FFMPEG_URL}" >&2
    echo "  expected ${FFMPEG_SHA256}" >&2
    echo "  actual   ${ACTUAL_SHA256}" >&2
    echo "" >&2
    echo "Either upstream has published a new build at this unversioned URL, or the" >&2
    echo "download was corrupted or tampered with. Do not update the pinned digest to" >&2
    echo "match without first establishing which of those happened." >&2
    rm -f "${TARBALL}"
    exit 1
  fi
  echo "Integrity check passed: ${ACTUAL_SHA256}"
fi

# Extract only the two binaries actually invoked at runtime. --strip-components drops the
# versioned top-level directory so the version is not baked into the layer's paths.
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "${STAGE_DIR}"' EXIT

mkdir -p "${STAGE_DIR}/bin"
echo "Extracting ffmpeg and ffprobe"
tar -xJf "${TARBALL}" -C "${STAGE_DIR}/bin" --strip-components=1 \
  "ffmpeg-${FFMPEG_VERSION}-amd64-static/ffmpeg" \
  "ffmpeg-${FFMPEG_VERSION}-amd64-static/ffprobe"

for binary in ffmpeg ffprobe; do
  if [ ! -f "${STAGE_DIR}/bin/${binary}" ]; then
    echo "Error: ${binary} missing after extraction - the archive layout may have changed." >&2
    exit 1
  fi
  # The execute bit has to survive into the zip or the Lambda runtime cannot run these.
  chmod 755 "${STAGE_DIR}/bin/${binary}"
done

# Build with the zip CLI rather than any language-level zip helper, because it records Unix
# permission bits. A zip written without them extracts as 0644 in the layer and the binaries
# then fail at runtime with "permission denied".
echo "Creating ${ZIP_PATH}"
rm -f "${ZIP_PATH}"
( cd "${STAGE_DIR}" && zip -r -q -X "${ZIP_PATH}" bin )

# Confirm the execute bit actually made it into the archive rather than assuming zip did it.
if ! unzip -Z1 -l "${ZIP_PATH}" >/dev/null 2>&1; then
  echo "Note: unzip not available, skipping archive permission verification." >&2
else
  if ! unzip -Z "${ZIP_PATH}" "bin/ffmpeg" | grep -q '^-rwxr-xr-x'; then
    echo "Error: bin/ffmpeg is not executable inside ${ZIP_PATH}." >&2
    echo "The layer would deploy but fail at runtime. Build this on Linux or macOS." >&2
    exit 1
  fi
fi

echo "Built ffmpeg layer: ${ZIP_PATH}"
echo "  ffmpeg version ${FFMPEG_VERSION}, contents: bin/ffmpeg bin/ffprobe"
