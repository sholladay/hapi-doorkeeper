'use strict';

const path = require('path');
const boom = require('boom');
const joi = require('joi');
const { hasHost } = require('url-type');
const pkg = require('./package.json');

const register = (server, option, done) => {
    const { error, value : config } = joi.validate(Object.assign({}, option), {
        sessionSecretKey : joi.string().required().min(32),
        auth0Domain      : joi.string().required().hostname().min(3),
        auth0PublicKey   : joi.string().required().token().min(5),
        auth0SecretKey   : joi.string().required().token().min(5)
    });

    if (error) {
        done(error);
        return;
    }

    server.auth.strategy('session', 'cookie', {
        password     : config.sessionSecretKey,
        cookie       : 'sid',
        redirectTo   : '/login',
        appendNext   : true,
        clearInvalid : true,
        isHttpOnly   : true,
        isSecure     : true
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

    const resolveNext = (query) => {
        const { next } = query;
        const lastNext = Array.isArray(next) ? next[next.length - 1] : next;
        return path.resolve('/', (!hasHost(lastNext) && lastNext) || '');
    };

    server.route({
        method : 'GET',
        path   : '/login',
        config : {
            description : 'Begin a user session.',
            tags        : ['user', 'auth', 'session', 'login'],
            auth        : {
                strategy : 'auth0',
                mode     : 'try'
            }
        },
        handler(request, reply) {
            const { auth } = request;
            if (auth.isAuthenticated) {
                // credentials also has: .expiresIn, .token, .refreshToken
                // Put the Auth0 profile in a cookie. The browser may ignore it If it is too big.
                // TODO: Perhaps save only user ID and map it to a server-side cache instead.
                request.cookieAuth.set({ user : auth.credentials.profile });
                reply.redirect(resolveNext(auth.credentials.query));
            }
            // This happens when users deny us access to their OAuth provider.
            // Chances are they clicked the wrong social icon.
            else if (auth.error.message.startsWith('App rejected')) {
                // Give the user another chance to login.
                reply.redirect('/login');
            }
            else {
                reply(boom.unauthorized(auth.error.message));
            }
        }
    });

    server.route({
        method : 'GET',
        path   : '/logout',
        config : {
            description : 'End a user session.',
            tags        : ['user', 'auth', 'session', 'logout'],
            auth        : false
        },
        handler(request, reply) {
            request.cookieAuth.clear();
            reply.redirect(resolveNext(request.query));
        }
    });

    done();
};

register.attributes = {
    pkg,
    // TODO: Consider bundling bell and hapi-auth-cookie for the user, like this:
    // https://github.com/ruiquelhas/copperfield/blob/b9b0d52d0f136a14885de471b32fb00d5edd2541/lib/index.js#L16
    dependencies : [
        'hapi-auth-cookie',
        'bell'
    ]
};

module.exports = {
    register
};
