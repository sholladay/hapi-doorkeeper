'use strict';

const path = require('path');
const boom = require('boom');
const joi = require('joi');
const { hasHost } = require('url-type');
const pkg = require('./package.json');

const register = (server, option) => {
    const config = joi.attempt(option, joi.object().required().keys({
        sessionSecretKey : joi.string().required().min(32),
        auth0Domain      : joi.string().required().hostname().min(3),
        auth0PublicKey   : joi.string().required().token().min(5),
        auth0SecretKey   : joi.string().required().token().min(5)
    }));

    server.auth.strategy('session', 'cookie', {
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
        ttl          : 60 * 60 * 24,
        password     : config.sessionSecretKey,
        clientId     : config.auth0PublicKey,
        clientSecret : config.auth0SecretKey,
        isHttpOnly   : true,
        isSecure     : true,
        forceHttps   : true
    });

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
        handler(request, h) {
            const { auth } = request;
            if (auth.isAuthenticated) {
                // Credentials also have: .expiresIn, .token, .refreshToken
                // Put the Auth0 profile in a cookie. The browser may ignore it If it is too big.
                if (auth.credentials.profile.raw.scope) {
                    request.cookieAuth.set({
                        user  : auth.credentials.profile,
                        scope : auth.credentials.profile.raw.scope
                    });
                }
                else {
                    request.cookieAuth.set({ user : auth.credentials.profile });
                }
                const { next } = auth.credentials.query;
                const lastNext = Array.isArray(next) ? next[next.length - 1] : next;
                if (hasHost(lastNext)) {
                    throw boom.badRequest('Absolute URLs are not allowed in the `next` parameter for security reasons');
                }
                return h.redirect(path.posix.resolve('/', lastNext || ''));
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
            const { next } = request.query;
            const lastNext = Array.isArray(next) ? next[next.length - 1] : next;
            if (hasHost(lastNext)) {
                throw boom.badRequest('Absolute URLs are not allowed in the `next` parameter for security reasons');
            }
            return h.redirect(path.posix.resolve('/', lastNext || ''));
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
