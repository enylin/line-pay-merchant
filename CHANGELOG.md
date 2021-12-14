# [0.2.0](https://github.com/enylin/line-pay-merchant/compare/v0.1.1...v0.2.0) (2021-12-14)


### Features

* **error:** add basic error types ([8c0c8b7](https://github.com/enylin/line-pay-merchant/commit/8c0c8b70d24099f6f454ea83d4f97cb445ac60d7))
* **handler:** add duplicate request handler ([0708066](https://github.com/enylin/line-pay-merchant/commit/0708066c4ea6b75d149a420b1a0ea3a5ca88e920))
* **handler:** add retry handler ([a96f2d3](https://github.com/enylin/line-pay-merchant/commit/a96f2d371f1db6f5185e098f4edd440f5d6aebf3))
* **handler:** export built-in handlers ([41be390](https://github.com/enylin/line-pay-merchant/commit/41be3904811b6c78f1b39344da8f6859a1409932))
* **handler:** rename duplicate-request handler and allow customized predicate ([28c552c](https://github.com/enylin/line-pay-merchant/commit/28c552c191ca66eac0d615bfb2ddd881a79ef5c0))



## [0.1.1](https://github.com/enylin/line-pay-merchant/compare/v0.1.0...v0.1.1) (2021-12-13)


### Bug Fixes

* **api:** update api types ([1abe716](https://github.com/enylin/line-pay-merchant/commit/1abe71688f2b0fb86f4bafe7f27a24aa63698d9a))
* **transactionid:** convert transaction ID to string to prevent from losing precision ([7cd72e7](https://github.com/enylin/line-pay-merchant/commit/7cd72e7c6d7f245317fb04756110bd36afbc27c3))


### BREAKING CHANGES

* **transactionid:** Convert transaction ID from number to string.



# 0.1.0 (2021-12-12)


### Features

* **api:** implement confirm api ([5bd377b](https://github.com/enylin/line-pay-merchant/commit/5bd377b850d5a99acde155575d8e1b0cdb493779))
* **api:** implement payment details ([392eb76](https://github.com/enylin/line-pay-merchant/commit/392eb763c5060fcc1c13d7d7b36fa25a31a89ecb))
* **api:** implement refund api ([a1c1735](https://github.com/enylin/line-pay-merchant/commit/a1c1735f6ba139d8192814c390a7cca2562d77de))
* **api:** implement request api ([d4f9528](https://github.com/enylin/line-pay-merchant/commit/d4f9528d889ff8e33cbfae2587f7e8c8747e67dc))
* **api:** support handler by adding api wrapper ([2ee05e2](https://github.com/enylin/line-pay-merchant/commit/2ee05e2658acd9bc1b1a1ffc52aaf0ce5223ebdf))
* **api:** throw error when response code is not 0000 ([04a7cd1](https://github.com/enylin/line-pay-merchant/commit/04a7cd10686a18bdece6bf146dc5c878f10a25aa))



