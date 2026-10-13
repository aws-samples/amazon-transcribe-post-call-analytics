const AWS = require("aws-sdk");
const cognito = new AWS.CognitoIdentityServiceProvider();

const defaultRole = "call-readwrite";

exports.handler = async (event) => {
  console.log("Cognito trigger event:", JSON.stringify(event));

  const triggerSource = event.triggerSource;

  // Act on PostConfirmation_ConfirmSignUp (self-signup) or
  // PostAuthentication_Authentication (admin-created users on first login)
  if (triggerSource === "PostConfirmation_ConfirmSignUp" ||
      triggerSource === "PostAuthentication_Authentication") {

    // For PostAuthentication, only set role if not already assigned
    const currentRole = event.request?.userAttributes?.["custom:pca_role"];
    if (triggerSource === "PostAuthentication_Authentication" && currentRole) {
      console.log(`User '${event.userName}' already has role '${currentRole}', skipping.`);
      return event;
    }

    const userPoolId = event.userPoolId;
    try {
      await cognito.adminUpdateUserAttributes({
        UserPoolId: userPoolId,
        Username: event.userName,
        UserAttributes: [
          { Name: "custom:pca_role", Value: defaultRole },
        ],
      }).promise();
      console.log(`Set default role '${defaultRole}' for user '${event.userName}'`);
    } catch (err) {
      console.error("Failed to set default role:", err);
      // Don't throw — allow sign-up/login to proceed even if role assignment fails
    }
  }

  return event;
};
