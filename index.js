'use strict';

const path = require('path');
const boom = require('boom');
const accept = require('accept');
const joi = require('joi');
const { hasHost } = require('url-type');
const pkg = require('./package.json');

const defaultParams = (request) => {
    const { screen } = request.query;
    const lastScreen = Array.isArray(screen) ? screen[screen.length - 1] : screen;
    return lastScreen ? { screen : lastScreen } : {};
};

const redirectTo = ({ headers }) => {
    const [favoriteType] = accept.mediaTypes(headers.accept);
    return !['application/json', 'application/*'].includes(favoriteType) && '/login';
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
        redirectTo,
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
        ttl            : 1000 * 60 * 60 * 24,
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
        handler(request, h) {
            const { auth } = request;
            if (auth.isAuthenticated) {
                // Credentials also have: .expiresIn, .token, .refreshToken
                // Put the Auth0 profile in a cookie. The browser may ignore it If it is too big.
                request.cookieAuth.set({ user : auth.credentials.profile });
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
