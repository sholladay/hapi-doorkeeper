# hapi-doorkeeper [![Build status for hapi Doorkeeper](https://img.shields.io/circleci/project/sholladay/hapi-doorkeeper/master.svg "Build Status")](https://circleci.com/gh/sholladay/hapi-doorkeeper "Builds")

> User authentication for web servers

This [hapi](https://hapijs.com) plugin makes it easy to add a secure login and logout system for your users.

## Why?

 - User auth is a very common need.
 - User auth is a major source of security problems.
 - Secure systems should be easy to set up and use.
 - Comes with built-in login and logout routes.

## Install

```sh
npm install hapi-doorkeeper --save
```

## Usage

Register the plugin on your server to provide the user auth routes.

```js
const hapi = require('hapi');
const bell = require('bell');
const cookie = require('hapi-auth-cookie');
const doorkeeper = require('hapi-doorkeeper');

const server = hapi.server();

const init = async () => {
    await server.register([bell, cookie, {
        plugin  : doorkeeper,
        options : {
            sessionSecretKey : 'please-make-this-much-more-secure',
            auth0Domain      : 'my-app.auth0.com',
            auth0PublicKey   : 'some-app-id',
            auth0SecretKey   : 'even-more-secret'
        }
    }]);
    server.route({
        method : 'GET',
        path   : '/dashboard',
        config : {
            auth : {
                strategy : 'session',
                mode     : 'required'
            }
        },
        handler(request) {
            const { user } = request.auth.credentials;
            return `Hi ${user.name}, you are logged in! Here is the profile from Auth0: <pre>${JSON.stringify(user.raw, null, 4)}</pre> <a href="/logout">Click here to log out</a>`;
        }
    });
    await server.start();
    console.log('Server ready:', server.info.uri);
};

init();
```

The route above at `/dashboard` can only be accessed by logged in users, as denoted by the `session` strategy being `required`. If you are logged in, it will display your profile, otherwise it will redirect you to a login screen.

Authentication is managed by [Auth0](https://auth0.com/). A few steps are required to finish the integration.

 1. [Sign up for Auth0](https://auth0.com/)
 2. [Set up an Auth0 Application](https://auth0.com/docs/applications/application-types)
 3. [Provide credentials from Auth0](#plugin-options)

User data is stored using [hapi-auth-cookie](https://github.com/hapijs/hapi-auth-cookie) as an object with a `user` namespace so that you may store additional data alongside what this project provides, without conflicts. Access it as `request.auth.credentials.user`.

## API

### Routes

Standard user authentication routes are included and will be added to your server when the plugin is registered.

#### GET /login

Tags: `user`, `auth`, `session`, `login`

Begins a user session. If a session is already active, the user will be given the opportunity to log in with a different account.

If the user denies access to a social account, they will be redirected back to the login page so that they may try again, as this usually means they chose the wrong account or provider by accident. All other errors will be returned to the client with a 401 Unauthorized status. You may use [`hapi-error-page`](https://github.com/sholladay/hapi-error-page) or [`onPreResponse`](https://hapijs.com/api#error-transformation) to make beautiful HTML pages for them.

#### GET /logout

Tags: `user`, `auth`, `session`, `logout`

Ends a user session. Safe to visit regardless of whether a session is active or the validity of the user's credentials. The user will be redirected to `/`, the root of the server.

### Plugin options

#### validateFunc

Type: `function`

An optional event handler used to implement business logic for checking and modifying the session on each request. See [hapi-auth-cookie](https://github.com/hapijs/hapi-auth-cookie#hapi-auth-cookie) for details.

#### sessionSecretKey

Type: `string`

A passphrase used to secure session cookies. Should be at least 32 characters long and occasionally rotated. See [Iron](https://github.com/hueniverse/iron) for more details.

#### auth0Domain

Type: `string`

The domain associated with your Auth0 account.

#### auth0PublicKey

Type: `string`

The ID for an [Auth0 Application](https://manage.auth0.com/#/applications).

#### auth0SecretKey

Type: `string`

The secret key for an [Auth0 Application](https://manage.auth0.com/#/applications).

## Contributing

See our [contributing guidelines](https://github.com/sholladay/hapi-doorkeeper/blob/master/CONTRIBUTING.md "Guidelines for participating in this project") for more details.

1. [Fork it](https://github.com/sholladay/hapi-doorkeeper/fork).
2. Make a feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. [Submit a pull request](https://github.com/sholladay/hapi-doorkeeper/compare "Submit code to this project for review").

## License

[MPL-2.0](https://github.com/sholladay/hapi-doorkeeper/blob/master/LICENSE "License for hapi-doorkeeper") © [Seth Holladay](https://seth-holladay.com "Author of hapi-doorkeeper")

Go make something, dang it.
