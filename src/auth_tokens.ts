

const USER_AUTH_TOKENS = new Map<string, string>();

export const authenticateToken = (token: string, email: string) => {
    USER_AUTH_TOKENS.set(token, email);
}

export const deauthenticateToken = (token: string) => {
    USER_AUTH_TOKENS.delete(token);
}

export const isTokenValid = (token: string) => {
    return getTokenEmail(token) ? true : false;
}

export const getTokenEmail = (token: string) => {
    return USER_AUTH_TOKENS.get(token);
}