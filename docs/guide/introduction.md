# Introduction

LINE Pay Merchant is a JavaScript library for integrating LINE Pay Online APIs.
The goal of this library is to help developers build reliable [LINE Pay](https://pay.line.me) applications.
It handles tedious jobs to help developers focus on business logic and ideas that produce value.

This library implements HTTP API calls and generates authentication headers automatically;
provides [TypeScript](https://www.typescriptlang.org/) type definitions of LINE Pay API requests and responses, which can be helpful in finding errors at compile time;
and provides built-in handlers to deal with exceptions, including API timeouts and duplicate transaction requests.
For added flexibility, users can define custom request/response handlers.
