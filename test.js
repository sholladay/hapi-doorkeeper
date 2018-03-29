import test from 'ava';
import hapi from 'hapi';
import cookie from 'hapi-auth-cookie';
import bell from 'bell';
import doorkeeper from '.';

const mockRoute = (option) => {
    return {
        method : 'GET',
        path   : '/',
        handler() {
            return 'foo';
        },
        ...option
    };
};

const mockServer = async (option) => {
    const { plugin, route } = {
        plugin : [cookie, bell, {
            plugin  : doorkeeper,
            options : {
                sessionSecretKey : 'pleasemakethissignificantlymoresecure',
                auth0Domain      : 'my-app.auth0.com',
                auth0PublicKey   : 'someclientid',
                auth0SecretKey   : 'evenmoresecretthanthesessionsecretkey'
            }
        }],
        route  : mockRoute(),
        ...option
    };
    const server = hapi.server();
    if (plugin) {
        await server.register(plugin);
    }
    if (route) {
        server.route(route);
    }
    return server;
};

const mockRequest = (server, option) => {
    return server.inject({
        method : 'GET',
        url    : '/',
        ...option
    });
};

test('without doorkeeper', async (t) => {
    const server = await mockServer({
        plugin : null
    });
    const response = await mockRequest(server);
    t.is(response.statusCode, 200);
    t.is(response.payload, 'foo');
});

test('missing options', async (t) => {
    const err = await t.throws(mockServer({
        plugin : [cookie, bell, doorkeeper]
    }));
    t.regex(err.message, /required/);
});

test('default auth', async (t) => {
    const server = await mockServer();
    const response = await mockRequest(server);
    t.is(response.statusCode, 200);
    t.is(response.payload, 'foo');
});

test('required auth', async (t) => {
    const server = await mockServer({
        route : mockRoute({
            config : {
                auth : {
                    strategy : 'session',
                    mode     : 'required'
                }
            }
        })
    });
    const response = await mockRequest(server);
    t.is(response.statusCode, 302);
    t.is(response.headers.location, '/login?next=' + encodeURIComponent('/'));
    t.is(response.payload, 'You are being redirected...');
});

test('/login route', async (t) => {
    const server = await mockServer({
        route : null
    });
    const response = await mockRequest(server, {
        url : '/login'
    });

    t.is(response.statusCode, 302);
    t.true(response.headers['set-cookie'][0].startsWith('bell-auth0='));
    t.true(response.headers['set-cookie'][0].endsWith('; Secure; HttpOnly; SameSite=Strict; Path=/'));
    t.true(response.headers.location.startsWith('https://my-app.auth0.com/authorize?client_id=someclientid&response_type=code&redirect_uri=https%3A%2F%2F'));
    t.true(response.headers.location.includes('%2Flogin&state='));
    t.is(response.payload, '');
});

test('/logout route', async (t) => {
    const server = await mockServer({
        route : null
    });
    const response = await mockRequest(server, {
        url : '/logout'
    });
    t.is(response.statusCode, 302);
    t.is(response.headers['set-cookie'][0], 'sid=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict; Path=/');
    t.is(response.headers.location, '/');
    t.is(response.payload, '');
});

test('/logout redirects to next', async (t) => {
    const server = await mockServer({
        route : null
    });
    const bare = await mockRequest(server, {
        url : '/logout?next=bah'
    });
    t.is(bare.statusCode, 302);
    t.is(bare.headers.location, '/bah');
    t.is(bare.payload, '');

    const slash = await mockRequest(server, {
        url : '/logout?next=/bah'
    });
    t.is(slash.statusCode, 302);
    t.is(slash.headers.location, '/bah');
    t.is(slash.payload, '');

    const encodedSlash = await mockRequest(server, {
        url : '/logout?next=' + encodeURIComponent('/bah')
    });
    t.is(encodedSlash.statusCode, 302);
    t.is(encodedSlash.headers.location, '/bah');
    t.is(encodedSlash.payload, '');
});

test('/logout rejects absolute next', async (t) => {
    const server = await mockServer({
        route : null
    });
    const absolute = await mockRequest(server, {
        url : '/logout?next=http://example.com/bah'
    });
    t.is(absolute.statusCode, 400);
    t.is(JSON.parse(absolute.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');

    const encodedAbsolute = await mockRequest(server, {
        url : '/logout?next=' + encodeURIComponent('http://example.com/bah')
    });
    t.is(encodedAbsolute.statusCode, 400);
    t.is(JSON.parse(encodedAbsolute.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');

    const schemeless = await mockRequest(server, {
        url : '/logout?next=//example.com/bah'
    });
    t.is(schemeless.statusCode, 400);
    t.is(JSON.parse(schemeless.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');

    const encodedSchemeless = await mockRequest(server, {
        url : '/logout?next=' + encodeURIComponent('//example.com/bah')
    });
    t.is(encodedSchemeless.statusCode, 400);
    t.is(JSON.parse(encodedSchemeless.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');
});
