import test from 'ava';
import { Server } from 'hapi';
import cookie from 'hapi-auth-cookie';
import bell from 'bell';
import doorkeeper from '.';

const mockRoute = (option) => {
    return Object.assign(
        {
            method : 'GET',
            path   : '/',
            handler(request, reply) {
                reply('foo');
            }
        },
        option
    );
};

const mockServer = async (option) => {
    const { plugin, route } = Object.assign(
        {
            plugin : [cookie, bell, doorkeeper],
            route  : mockRoute()
        },
        option
    );
    const server = new Server();
    server.connection();
    if (plugin) {
        await server.register(plugin);
    }
    if (route) {
        server.route(route);
    }
    await server.start();
    return server;
};

const mockRequest = (server, option) => {
    return server.inject(Object.assign(
        {
            method : 'GET',
            url    : '/'
        },
        option
    ));
};

const setEnv = () => {
    const { env } = process;
    env.SESSION_COOKIE_PASSWORD = 'oh-my-goodness-this-is-not-secure';
    env.AUTH0_DOMAIN = 'example.com';
    env.AUTH0_CLIENT_ID = 'some-client';
    env.AUTH0_CLIENT_SECRET = 'some-secret';
};

test.beforeEach(() => {
    const { env } = process;
    delete env.SESSION_COOKIE_PASSWORD;
    delete env.AUTH0_DOMAIN;
    delete env.AUTH0_CLIENT_ID;
    delete env.AUTH0_CLIENT_SECRET;
});

test('without doorkeeper', async (t) => {
    const server = await mockServer({
        plugin : null
    });
    const response = await mockRequest(server);

    t.is(response.statusCode, 200);
    t.is(response.payload, 'foo');

    await server.stop();
});

test('missing env vars', async (t) => {
    const err = await t.throws(mockServer());
    t.regex(err.message, /required/);
});

test('default auth', async (t) => {
    setEnv();
    const server = await mockServer();
    const response = await mockRequest(server);

    t.is(response.statusCode, 200);
    t.is(response.payload, 'foo');

    await server.stop();
});

test('required auth', async (t) => {
    setEnv();
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

    await server.stop();
});

test('/login route', async (t) => {
    setEnv();
    const server = await mockServer({
        route : null
    });
    const response = await mockRequest(server, {
        url : '/login'
    });

    t.is(response.statusCode, 302);
    t.true(response.headers.location.startsWith('https://example.com/authorize?client_id=some-client&response_type=code&redirect_uri=https%3A%2F%2F'));
    t.true(response.headers.location.includes('%2Flogin&state='));
    t.is(response.payload, '');

    await server.stop();
});

test('/logout route', async (t) => {
    setEnv();
    const server = await mockServer({
        route : null
    });
    const response = await mockRequest(server, {
        url : '/logout'
    });

    t.is(response.statusCode, 302);
    t.is(response.headers.location, '/');
    t.is(response.payload, '');

    await server.stop();
});

test('/logout redirects to next', async (t) => {
    setEnv();
    const server = await mockServer({
        route : null
    });
    const response = await mockRequest(server, {
        url : '/logout?next=bah'
    });

    t.is(response.statusCode, 302);
    t.is(response.headers.location, '/bah');
    t.is(response.payload, '');

    await server.stop();
});

test('/logout ignores absolute next', async (t) => {
    setEnv();
    const server = await mockServer({
        route : null
    });

    const encoded = await mockRequest(server, {
        url : '/logout?next=' + encodeURIComponent('http://example.com/bah')
    });

    t.is(encoded.statusCode, 302);
    t.is(encoded.headers.location, '/');
    t.is(encoded.payload, '');

    const unencoded = await mockRequest(server, {
        url : '/logout?next=http://example.com/bah'
    });

    t.is(unencoded.statusCode, 302);
    t.is(unencoded.headers.location, '/');
    t.is(unencoded.payload, '');

    await server.stop();
});
