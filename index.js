'use strict';

const path = require('path');
const boom = require('boom');
const joi = require('joi');
const got = require('got');
const { hasHost } = require('url-type');
const pkg = require('./package.json');

const defaultParams = (request) => {
    const { screen } = request.query;
    const lastScreen = Array.isArray(screen) ? screen[screen.length - 1] : screen;
    return lastScreen ? { screen : lastScreen } : {};
};

const register = (server, option) => {
    const config = joi.attempt(option, joi.object().required().keys({
        validateFunc     : joi.func().optional(),
        providerParams   : joi.func().optional().default(defaultParams),
        sessionSecretKey : joi.string().required().min(32),
        auth0Domain      : joi.string().required().hostname().min(3),
        auth0PublicKey   : joi.string().required().token().min(10),
        auth0SecretKey   : joi.string().required().min(30).regex(/^[A-Za-z\d_-]+$/)
    }));

    server.auth.strategy('session', 'cookie', {
        validateFunc : config.validateFunc,
        password     : config.sessionSecretKey,
        cookie       : 'sid',
        redirectTo   : '/login',
        appendNext   : true,
        clearInvalid : true,
        isHttpOnly   : true,
        isSecure     : true,
        isSameSite   : 'Lax'
    });

    server.auth.strategy('auth0', 'bell', {
        provider : 'auth0',
        config   : {
            domain : config.auth0Domain
        },
        ttl            : 60 * 60 * 24,
        password       : config.sessionSecretKey,
        clientId       : config.auth0PublicKey,
        clientSecret   : config.auth0SecretKey,
        isHttpOnly     : true,
        isSecure       : true,
        forceHttps     : true,
        providerParams : config.providerParams
    });

    const resolveNext = (query) => {
        const { next } = query;
        const lastNext = Array.isArray(next) ? next[next.length - 1] : next;
        if (hasHost(lastNext)) {
            throw boom.badRequest('Absolute URLs are not allowed in the `next` parameter for security reasons');
        }
        return path.posix.resolve('/', lastNext || '');
    };

    server.route({
        method : 'GET',
        path   : '/login',
        config : {
            description : 'Begin a user session',
            tags        : ['user', 'auth', 'session', 'login'],
            auth        : {
                strategy : 'auth0',
                mode     : 'try'
            }
        },
        async handler(request, h) {

            const { auth } = request;
            const baseUrl = `https://${config.auth0Domain}`;

            const getToken = async () => {
                const { body } = await got.post(`${baseUrl}/oauth/token`, {
                    json : true,
                    body : {
                        grant_type    : 'client_credentials',
                        client_id     : config.auth0PublicKey,
                        client_secret : config.auth0SecretKey,
                        audience      : `${baseUrl}/api/v2/`
                    }
                });

                return body.access_token;
            };

            const token = await getToken();

            const getUsername = async () => {
                const { body } = await got.get(`${baseUrl}/api/v2/users/${auth.credentials.profile.id}`, {
                    json : true,
                    headers : {
                        authorization : `Bearer ${token}`
                    },
                    body : {
                        fields : 'username'
                    }
                })
                return body.username
            }
            const username = await getUsername();

            if (auth.isAuthenticated) {
                // Credentials also have: .expiresIn, .token, .refreshToken
                // Put the Auth0 profile in a cookie. The browser may ignore it If it is too big.
                request.cookieAuth.set({
                    user     : auth.credentials.profile,
                    username
                });
                return h.redirect(resolveNext(auth.credentials.query));
            }
            // This happens when users deny us access to their OAuth provider.
            // Chances are they clicked the wrong social icon.
            if (auth.error.message.startsWith('App rejected')) {
                // Give the user another chance to login.
                return h.redirect('/login');
            }

            throw boom.unauthorized(auth.error.message);
        }
    });

    server.route({
        method : 'GET',
        path   : '/logout',
        config : {
            description : 'End a user session',
            tags        : ['user', 'auth', 'session', 'logout'],
            auth        : false
        },
        handler(request, h) {
            request.cookieAuth.clear();
            return h.redirect(resolveNext(request.query));
        }
    });
};

module.exports.plugin = {
    register,
    pkg,
    // TODO: Consider bundling bell and hapi-auth-cookie for the user, like this:
    // https://github.com/ruiquelhas/copperfield/blob/b9b0d52d0f136a14885de471b32fb00d5edd2541/lib/index.js#L16
    dependencies : [
        'hapi-auth-cookie',
        'bell'
    ]
};
