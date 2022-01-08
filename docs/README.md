# line-pay-merchant

![NPM](https://img.shields.io/npm/l/line-pay-merchant)
![GitHub Workflow Status (branch)](https://img.shields.io/github/workflow/status/enylin/line-pay-merchant/ci/main)
![codecov](https://codecov.io/gh/enylin/line-pay-merchant/branch/main/graph/badge.svg)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/enylin/line-pay-merchant)
![npm](https://img.shields.io/npm/dt/line-pay-merchant)
![npm](https://img.shields.io/npm/v/line-pay-merchant)

LINE Pay V3 Online APIs library for Node.js

## Introduction

LINE Pay Merchant is a JavaScript library for integrating LINE Pay Online APIs.
The goal of this library is to help developers build reliable [LINE Pay](https://pay.line.me) applications.
It handles tedious jobs to help developers focus on business logic and ideas that produce value.

This library implements HTTP API calls and generates authentication headers automatically;
provides [TypeScript](https://www.typescriptlang.org/) type definitions of LINE Pay API requests and responses, which can be helpful in finding errors at compile time;
and provides built-in handlers to deal with exceptions, including API timeouts and duplicate transaction requests.
For added flexibility, users can define custom request/response handlers.

## Features

- Auto-generated LINE Pay API V3 authentication header
- Built-in API request and response [handler](./guide/handlers)
- Fully customizable API request and response [handler](./guide/handlers)
- [TypeScript](http://typescript.net/) support
- Handles transaction ID parsing (see [Transaction ID](#transaction-id))

## Installation

You can install the package from [NPM](https://www.npmjs.com/package/line-pay-merchant) with the following command:

```sh
# latest
npm install line-pay-merchant
```

## Example Usage

```js
import { createLinePayClient } from 'line-pay-merchant'
```

## Documentation

Please visit [documentation](https://enylin.github.io/line-pay-merchant/).

## Changelog

Please visit [changelog](https://github.com/enylin/line-pay-merchant/blob/main/CHANGELOG.md).

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2020-present, Sean Lin
