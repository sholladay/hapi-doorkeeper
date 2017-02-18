'use strict';

const path = require('path');
const boom = require('boom');
const { hasHost } = require('url-type');
const pkg = require('./package.json');

const onReady = (server) => {
    const { env } = process;

    server.auth.strategy('session', 'cookie', {
        password     : env.SESSION_COOKIE_PASSWORD,
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
            domain : env.AUTH0_DOMAIN
        },
        ttl          : 60 * 60 * 24,
        password     : env.SESSION_COOKIE_PASSWORD,
        clientId     : env.AUTH0_CLIENT_ID,
        clientSecret : env.AUTH0_CLIENT_SECRET,
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
            tags        : ['user', 'auth', 'session', 'login'],
            description : 'Begin a user session.',
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
            tags        : ['user', 'auth', 'session', 'logout'],
            description : 'End a user session.',
            auth        : false
        },
        handler(request, reply) {
            request.cookieAuth.clear();
            reply.redirect(resolveNext(request.query));
        }
    });
};

const register = (server, option, done) => {
    onReady(server);
    done();
};

register.attributes = {
    pkg,
    dependencies : [
        'hapi-auth-cookie',
        'bell'
    ]
};

module.exports = {
    register
};
