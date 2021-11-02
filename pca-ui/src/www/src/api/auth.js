const config = window.pcaSettings;
const webUri = `${window.location.protocol}//${window.location.host}/`;
const loginUrl = `${config.auth.uri}/login?client_id=${config.auth.clientId}&response_type=code&redirect_uri=${webUri}`;

export function redirectToLogin(message, err) {
  console.debug("Redirect to login:", message, err);
  console.debug("Login URL is:", loginUrl);

  window.location.href = loginUrl;
}

export function parseAuthQueryString() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (error) {
    throw new Error(params.get("error_description") || "Invalid configuration");
  }
  return code;
}

export async function handleCode(code) {
  console.debug("Exchanging code for token:", code);

  let data;
  try {
    data = await authRequest("authorization_code", {
      redirect_uri: webUri,
      code: code,
    });
  } catch (err) {
    return redirectToLogin("Couldn't validate code", err);
  }

  store(data);

  // Remove code from URL
  const url = new URL(window.location);
  url.searchParams.delete("code");
  window.history.pushState({}, "", url);
}

async function authRequest(grant_type, data) {
  console.debug("Doing", grant_type, " with", data);
  let body = new URLSearchParams();
  body.append("grant_type", grant_type);
  body.append("client_id", config.auth.clientId);
  Object.keys(data).forEach((key) => {
    body.append(key, data[key]);
  });

  const url = `${config.auth.uri}/oauth2/token`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  });

  if (!response.ok) {
    console.debug(response);
    throw new Error("Bad response from auth endpoint");
  }

  return response.json();
}

export async function getToken() {
  const token = window.localStorage.getItem("access_token");

  if (token === null) {
    return;
  }

  try {
    const payload = payloadFromToken(token);
    if (Math.floor(Date.now() / 1000) < payload.exp) {
      return token;
    }
  } catch (err) {
    console.debug(err);
  }

  // Refresh tokens
  console.debug("Expired token");

  try {
    return refreshToken();
  } catch (err) {
    return redirectToLogin("Error refreshing tokens", err);
  }
}

function payloadFromToken(token) {
  const parts = token.split(".");

  if (parts.length !== 3) throw new Error("Invalid token");

  return JSON.parse(window.atob(parts[1]));
}

export async function refreshToken() {
  // Remove old tokens
  window.localStorage.removeItem("id_token");
  window.localStorage.removeItem("access_token");
  // Get new token
  let data = await authRequest("refresh_token", {
    refresh_token: window.localStorage.getItem("refresh_token"),
  });
  console.debug("Tokens refreshed");

  store(data);

  return data.access_token;
}

function store(data) {
  window.localStorage.setItem("id_token", data.id_token);
  window.localStorage.setItem("access_token", data.access_token);
  window.localStorage.setItem("refresh_token", data.refresh_token);
}
