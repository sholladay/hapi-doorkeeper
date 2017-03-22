# hapi-doorkeeper [![Build status for hapi-doorkeeper on Circle CI.](https://img.shields.io/circleci/project/sholladay/hapi-doorkeeper/master.svg "Circle Build Status")](https://circleci.com/gh/sholladay/hapi-doorkeeper "Hapi Doorkeeper Builds")

> User authentication for web servers.

## Why?

 - User login is a major source of security problems.
 - User login is a very common need.
 - Secure systems should be easy to set up and use.

## Install

```sh
npm install hapi-doorkeeper --save
```

## Usage

Get it into your program.

```js
const doorkeeper = require('hapi-doorkeeper');
```

Register the plugin on your server.

```js
server.register({
    register : doorkeeper,
    options  : {
        sessionSecretKey : 'please-make-this-much-more-secure',
        auth0Domain      : 'my-app.auth0.com',
        auth0PublicKey   : 'some-client-id',
        auth0SecretKey   : 'even-more-secret'
    }
})
    .then(() => {
        return server.start();
    })
    .then(() => {
        console.log(server.info.uri);
    });
```

Set up a route that can only be accessed by logged in users.

```js
server.route({
    method : 'GET',
    path   : '/',
    config : {
        auth : {
            strategy : 'session',
            mode     : 'required'
        }
    },
    handler(request, reply) {
        const { user } = request.auth.credentials;
        reply(`Hi ${user.name}, you are logged in! Here is the profile from Auth0: <pre>${JSON.stringify(user.raw, null, 2)}</pre> <a href="/logout">Click here to log out</a>`);
    }
});
```

Authentication is managed by [Auth0](https://auth0.com/). A few steps are required to finish the integration.

 - [Sign up for Auth0](https://auth0.com/)
 - [Set up an Auth0 Client](https://auth0.com/docs/clients)
 - [Provide Auth0 credentials](#option)

User data is stored using [hapi-auth-cookie](https://github.com/hapijs/hapi-auth-cookie) as an object with a `user` namespace so that you may store additional data alongside what this project provides, without conflicts. Access it as `request.auth.credentials.user`.

## Routes

Standard user authentication routes are provided.

### GET /login

Tags: `user`, `auth`, `session`, `login`

Begins a user session. If a session is already active, the user will be given the opportunity to log in with a different account.

If the user denies access to a social account, they will be redirected back to the login page so that they may try again, as this usually means they chose the wrong account or provider by accident. All other errors will be returned to the client with a 401 Unauthorized status. You may use [`onPreResponse`](https://hapijs.com/api#error-transformation) or [`hapi-error`](https://www.npmjs.com/package/hapi-error) to make beautiful error pages for them.

### GET /logout

Tags: `user`, `auth`, `session`, `logout`

Ends a user session. Safe to visit regardless of whether a session is active or the validity of the user's credentials. The user will be redirected to `/`, the root of the server.

## API

### option

Type: `object`

Plugin settings. All of these are required.

#### sessionSecretKey

Type: `string`

A passphrase used for [Iron](https://github.com/hueniverse/iron) cookie encoding. Should be at least 32 characters long and occasionally rotated.

#### auth0Domain

Type: `string`

The domain associated with your Auth0 account.

#### auth0PublicKey

Type: `string`

The ID for an [Auth0 Client](manage.auth0.com/#/applications).

#### auth0SecretKey

Type: `string`

The secret key for an Auth0 Client.

## Contributing

See our [contributing guidelines](https://github.com/sholladay/hapi-doorkeeper/blob/master/CONTRIBUTING.md "The guidelines for participating in this project.") for more details.

1. [Fork it](https://github.com/sholladay/hapi-doorkeeper/fork).
2. Make a feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. [Submit a pull request](https://github.com/sholladay/hapi-doorkeeper/compare "Submit code to this project for review.").

## License

[MPL-2.0](https://github.com/sholladay/hapi-doorkeeper/blob/master/LICENSE "The license for hapi-doorkeeper.") © [Seth Holladay](http://seth-holladay.com "Author of hapi-doorkeeper.")

Go make something, dang it.
