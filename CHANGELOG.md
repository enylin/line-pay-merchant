# [0.9.0](https://github.com/enylin/line-pay-merchant/compare/v0.8.0...v0.9.0) (2022-06-09)


### Features

* **docs:** add Google Analytics to document website ([a1d47c0](https://github.com/enylin/line-pay-merchant/commit/a1d47c0a552dbe5410f5ea2faef7077040e0604c))



# [0.8.0](https://github.com/enylin/line-pay-merchant/compare/v0.7.0...v0.8.0) (2022-02-10)


### Bug Fixes

* **timeout-retry handler:** fix throwing error too early issue ([715d1d5](https://github.com/enylin/line-pay-merchant/commit/715d1d527342724ada525f359dff131eb7651fae))


### Features

* **handler:** export handlers directly in index.ts ([7208fb7](https://github.com/enylin/line-pay-merchant/commit/7208fb7ba66adcc75da3ef459ac66106a80b9430))
* **type:** export API types ([d83e6eb](https://github.com/enylin/line-pay-merchant/commit/d83e6eb1c64a7457f183d264fe2501b6fda2c4e0))


### BREAKING CHANGES

* **handler:** remove handler and error from exports



# [0.7.0](https://github.com/enylin/line-pay-merchant/compare/v0.6.0...v0.7.0) (2021-12-31)


### Bug Fixes

* **check-payment-status:** fix check-payment-status API ([76f87de](https://github.com/enylin/line-pay-merchant/commit/76f87de6923146cb1a9e1b1ddde00decefb6b153))
* **http-client:** parse last field in JSON object also ([ef2088b](https://github.com/enylin/line-pay-merchant/commit/ef2088bfe1e2b94dd0625497c98952a4db5fb3f5))


### Features

* **void:** implement void API ([3c4869c](https://github.com/enylin/line-pay-merchant/commit/3c4869c462c42b97a38b9a6ab19d2bd4849127cd))



# [0.6.0](https://github.com/enylin/line-pay-merchant/compare/v0.5.0...v0.6.0) (2021-12-27)


### Bug Fixes

* **error:** remove return codes begin with 0 from error list ([aaa2c09](https://github.com/enylin/line-pay-merchant/commit/aaa2c097be2113431dff1df57558752523e03b4f))
* **request:** fix type of payment.payType ([ace30dc](https://github.com/enylin/line-pay-merchant/commit/ace30dcaef895da04eeeb17629eb1eb3bc20a886))


### Features

* **api:** implement check regkey API ([88f9610](https://github.com/enylin/line-pay-merchant/commit/88f9610351e3ae17f6f5b295cc773a9ae8f75ec1))
* **api:** implement expire regKey API ([10571a6](https://github.com/enylin/line-pay-merchant/commit/10571a6468af1cba02fb981c1f5f0611b38dc9c6))



# [0.5.0](https://github.com/enylin/line-pay-merchant/compare/v0.4.0...v0.5.0) (2021-12-23)


### Features

* **api:** implement pay-preapproved API ([1da842e](https://github.com/enylin/line-pay-merchant/commit/1da842e61778cdcbeb7b4bf709e388c97f0e7352))



# [0.4.0](https://github.com/enylin/line-pay-merchant/compare/v0.3.0...v0.4.0) (2021-12-20)


### Features

* **api:** implement check-payment-status API ([3c725b9](https://github.com/enylin/line-pay-merchant/commit/3c725b9de5cb210a4c6c703357d14b06a260f67e))
* **error:** throw error if no request body ([6c96fcc](https://github.com/enylin/line-pay-merchant/commit/6c96fcc81f30809199604516a98919db342dd5af))



# [0.3.0](https://github.com/enylin/line-pay-merchant/compare/v0.2.0...v0.3.0) (2021-12-16)


### Features

* **api:** implement capture API ([9a89d4f](https://github.com/enylin/line-pay-merchant/commit/9a89d4fb433d72f228d5c12f20b40818c90575dc))
* **api:** support default timeout for each api ([d11e9f7](https://github.com/enylin/line-pay-merchant/commit/d11e9f70407701afdc162f06e27d3d6c54513725))
* **error:** export built-in errors ([72ea021](https://github.com/enylin/line-pay-merchant/commit/72ea0217f86a27ed2562ae4a7c06ae69aa3fb5d5))



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



