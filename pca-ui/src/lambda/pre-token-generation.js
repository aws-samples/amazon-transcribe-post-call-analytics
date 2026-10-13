/**
 * Cognito Pre-Token Generation V2 trigger.
 *
 * Injects the user's custom:pca_role attribute into the access token
 * so that API Gateway Lambda authorizers can read it directly from claims
 * without a server-side adminGetUser call.
 *
 * Trigger version must be V2_0 — V1 only supports ID token customization.
 */
exports.handler = async (event) => {
  console.log("Pre-token generation trigger event:", JSON.stringify(event));

  const pcaRole = event.request.userAttributes["custom:pca_role"] || "";

  // V2 response structure for access token customization
  event.response = {
    claimsAndScopeOverrideDetails: {
      accessTokenGeneration: {
        claimsToAddOrOverride: {
          "custom:pca_role": pcaRole,
        },
      },
    },
  };

  return event;
};
