const webUri = `${window.location.protocol}//${window.location.host}/`;
const loginUrl = `${config.auth.uri}/login?client_id=${config.auth.clientId}&response_type=code&redirect_uri=${webUri}`;

export function redirectToLogin(message, err) {
    console.debug("Redirect to login:", message, err);
    console.debug("Login URL is:", loginUrl);

    window.location.href = loginUrl;
}

export async function handleCode() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code === null) {
        return; // No code to handle
    }

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

    console.debug("Code data:", data);

    window.localStorage.setItem("id_token", data.id_token);
    window.localStorage.setItem("access_token", data.access_token);
    window.localStorage.setItem("refresh_token", data.refresh_token);

    console.debug("Stored new tokens");

    // Remove code from URL
    params.delete("code");
    let queryString = params.toString();
    if (queryString.length > 0) {
        queryString = "?" + queryString;
    }
    window.location.search = queryString;
}

async function authRequest(grant_type, data) {
    console.debug("Doing", grant_type, " with", data);
    let body = new URLSearchParams();
    body.append("grant_type", grant_type);
    body.append("client_id", config.auth.clientId);
    Object.keys(data).forEach((key) => {
        body.append(key, data[key]);
    });

    console.debug("Body:", body);

    let response;
    try {
        response = await window.fetch(`${config.auth.uri}/oauth2/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body,
        });
    } catch (e) {
        console.debug("Auth err:", e);
    }

    if (!response.ok) {
        console.debug(response);
        throw new Error("Bad response from auth endpoint");
    }

    return await response.json();
}

export async function getToken() {
    const token = window.localStorage.getItem("access_token");

    if (token === null) {
        return redirectToLogin("No token");
    }

    try {
        const payload = payloadFromToken(token);
        if (Math.floor(Date.now() / 1000) < payload.exp) {
            return token;
        }
    } catch (err) {
        return redirectToLogin("Bad token", err);
    }

    // Refresh tokens
    console.debug("Expired token");

    try {
        let data = await authRequest("refresh_token", {
            refresh_token: window.localStorage.getItem("refresh_token"),
        });

        console.debug("Tokens refreshed");
        window.localStorage.setItem("id_token", data.id_token);
        window.localStorage.setItem("access_token", data.access_token);

        return data.access_token;
    } catch (err) {
        return redirectToLogin("Error refreshing tokens", err);
    }
}

function payloadFromToken(token) {
    const parts = token.split(".");

    if (parts.length !== 3) throw new Error("Invalid token");

    return JSON.parse(window.atob(parts[1]));
}
