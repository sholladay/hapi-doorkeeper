import test from 'ava';
import hapi from 'hapi';
import cookie from 'hapi-auth-cookie';
import bell from 'bell';
import doorkeeper from '.';

const makeRoute = (option) => {
    return {
        method : 'GET',
        path   : '/',
        handler() {
            return 'foo';
        },
        ...option
    };
};

const makeServer = async (option) => {
    const { plugin } = {
        plugin : [cookie, bell, {
            plugin  : doorkeeper,
            options : {
                sessionSecretKey : 'pleasemakethissignificantlymoresecure',
                auth0Domain      : 'my-app.auth0.com',
                auth0PublicKey   : 'someclientid',
                auth0SecretKey   : 'evenmoresecretthanthesessionsecretkey'
            }
        }],
        ...option
    };
    const server = hapi.server();
    if (plugin) {
        await server.register(plugin);
    }
    return server;
};

test('without doorkeeper', async (t) => {
    const server = await makeServer({ plugin : null });
    server.route(makeRoute());
    const response = await server.inject('/');
    t.is(response.statusCode, 200);
    t.is(response.headers['content-type'], 'text/html; charset=utf-8');
    t.is(response.payload, 'foo');
});

test('missing options', async (t) => {
    const err = await t.throwsAsync(makeServer({
        plugin : [cookie, bell, doorkeeper]
    }));
    t.regex(err.message, /required/);
});

test('default auth', async (t) => {
    const server = await makeServer();
    server.route(makeRoute());
    const response = await server.inject('/');
    t.is(response.statusCode, 200);
    t.is(response.headers['content-type'], 'text/html; charset=utf-8');
    t.is(response.payload, 'foo');
});

test('does not redirect without accept header', async (t) => {
    const server = await makeServer();
    server.route(makeRoute({
        config : {
            auth : {
                strategy : 'session',
                mode     : 'required'
            }
        }
    }));
    const response = await server.inject('/');
    t.is(response.statusCode, 401);
    t.is(response.statusMessage, 'Unauthorized');
    t.is(response.headers['content-type'], 'application/json; charset=utf-8');
    t.false('location' in response.headers);
    t.is(JSON.parse(response.payload).message, 'Missing authentication');
});

test('honors accept header', async (t) => {
    const server = await makeServer();
    server.route(makeRoute({
        config : {
            auth : {
                strategy : 'session',
                mode     : 'required'
            }
        }
    }));

    const anyResp = await server.inject({
        url     : '/',
        headers : {
            accept : '*/*'
        }
    });
    t.is(anyResp.statusCode, 401);
    t.is(anyResp.statusMessage, 'Unauthorized');
    t.is(anyResp.headers['content-type'], 'application/json; charset=utf-8');
    t.false('location' in anyResp.headers);
    t.is(JSON.parse(anyResp.payload).message, 'Missing authentication');

    const jsonPreferred = await server.inject({
        url     : '/',
        headers : {
            accept : 'text/html;q=0.9, application/json'
        }
    });
    t.is(jsonPreferred.statusCode, 401);
    t.is(jsonPreferred.statusMessage, 'Unauthorized');
    t.is(jsonPreferred.headers['content-type'], 'application/json; charset=utf-8');
    t.false('location' in jsonPreferred.headers);
    t.is(JSON.parse(jsonPreferred.payload).message, 'Missing authentication');

    const htmlResp = await server.inject({
        url     : '/',
        headers : {
            accept : 'text/html'
        }
    });
    t.is(htmlResp.statusCode, 302);
    t.is(htmlResp.statusMessage, 'Found');
    t.is(htmlResp.headers['content-type'], 'text/html; charset=utf-8');
    t.is(htmlResp.headers.location, '/login?next=' + encodeURIComponent('/'));
    t.is(htmlResp.payload, 'You are being redirected...');
});

test('/login route', async (t) => {
    const server = await makeServer();
    const response = await server.inject('/login');

    t.is(response.statusCode, 302);
    t.is(response.statusMessage, 'Found');
    t.is(response.headers['set-cookie'].length, 1);
    t.true(response.headers['set-cookie'][0].startsWith('bell-auth0='));
    t.true(response.headers['set-cookie'][0].includes('; Max-Age=86400; Expires='));
    t.true(response.headers['set-cookie'][0].endsWith('; Secure; HttpOnly; SameSite=Strict; Path=/'));
    t.true(response.headers.location.startsWith('https://my-app.auth0.com/authorize?client_id=someclientid&response_type=code&redirect_uri=https%3A%2F%2F'));
    t.true(response.headers.location.includes('%2Flogin&state='));
    t.is(response.payload, '');
});

test('/logout route', async (t) => {
    const server = await makeServer();
    const response = await server.inject('/logout');
    t.is(response.statusCode, 302);
    t.is(response.statusMessage, 'Found');
    t.is(response.headers['set-cookie'][0], 'sid=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax; Path=/');
    t.is(response.headers.location, '/');
    t.is(response.payload, '');
});

test('/logout redirects to next', async (t) => {
    const server = await makeServer();
    const bare = await server.inject('/logout?next=bah');
    t.is(bare.statusCode, 302);
    t.is(bare.statusMessage, 'Found');
    t.is(bare.headers.location, '/bah');
    t.is(bare.payload, '');

    const slash = await server.inject('/logout?next=/bah');
    t.is(slash.statusCode, 302);
    t.is(slash.statusMessage, 'Found');
    t.is(slash.headers.location, '/bah');
    t.is(slash.payload, '');

    const encoded = await server.inject('/logout?next=' + encodeURIComponent('/bah'));
    t.is(encoded.statusCode, 302);
    t.is(encoded.statusMessage, 'Found');
    t.is(encoded.headers.location, '/bah');
    t.is(encoded.payload, '');
});

test('/logout rejects absolute next', async (t) => {
    const server = await makeServer();
    const absolute = await server.inject('/logout?next=http://example.com/bah');
    t.is(absolute.statusCode, 400);
    t.is(absolute.statusMessage, 'Bad Request');
    t.is(absolute.headers['content-type'], 'application/json; charset=utf-8');
    t.is(JSON.parse(absolute.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');

    const encodedAbsolute = await server.inject('/logout?next=' + encodeURIComponent('http://example.com/bah'));
    t.is(encodedAbsolute.statusCode, 400);
    t.is(encodedAbsolute.statusMessage, 'Bad Request');
    t.is(encodedAbsolute.headers['content-type'], 'application/json; charset=utf-8');
    t.is(JSON.parse(encodedAbsolute.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');

    const schemeless = await server.inject('/logout?next=//example.com/bah');
    t.is(schemeless.statusCode, 400);
    t.is(schemeless.statusMessage, 'Bad Request');
    t.is(schemeless.headers['content-type'], 'application/json; charset=utf-8');
    t.is(JSON.parse(schemeless.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');

    const encodedSchemeless = await server.inject('/logout?next=' + encodeURIComponent('//example.com/bah'));
    t.is(encodedSchemeless.statusCode, 400);
    t.is(encodedSchemeless.statusMessage, 'Bad Request');
    t.is(encodedSchemeless.headers['content-type'], 'application/json; charset=utf-8');
    t.is(JSON.parse(encodedSchemeless.payload).message, 'Absolute URLs are not allowed in the `next` parameter for security reasons');
});
