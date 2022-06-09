import{_ as n,o as s,c as a,d as e}from"./app.951013b3.js";const i={},t=e(`<h1 id="request-api" tabindex="-1"><a class="header-anchor" href="#request-api" aria-hidden="true">#</a> Request API</h1><h2 id="overview" tabindex="-1"><a class="header-anchor" href="#overview" aria-hidden="true">#</a> Overview</h2><p>An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.</p><ul><li><a href="#send"><code>send</code></a></li><li><a href="#addhandler"><code>addHandler</code></a></li><li><a href="#addhandlers"><code>addHandlers</code></a></li></ul><h2 id="send" tabindex="-1"><a class="header-anchor" href="#send" aria-hidden="true">#</a> send</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">send</span><span class="token punctuation">(</span>requestRequestConfig<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>Promise&lt;ApiResponse&lt;RequestResponseBody&gt;&gt;</code></p><h3 id="request-config" tabindex="-1"><a class="header-anchor" href="#request-config" aria-hidden="true">#</a> Request Config</h3><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Package</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * An unique ID of package list
   */</span>
  id<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Total amount of products per package\\
   * \`=sum(products[].quantity * products[].price)\`
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * User fee: Respond if a commission is found within the payment amount.
   */</span>
  userFee<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Name of the package or name of internal shops
   */</span>
  name<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * products in the package
   */</span>
  products<span class="token operator">:</span> Product<span class="token punctuation">[</span><span class="token punctuation">]</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">RedirectUrls</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * An information to prevent phishing while transferring between apps in Android.
   */</span>
  appPackageName<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * A merchant URL user moves to after requesting the payment.
   */</span>
  confirmUrl<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * A navigation type of the ConfirmURL after user approves the payment request.
   */</span>
  confirmUrlType<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * A URL that moves to the next when LINE Pay member cancels the payment from the payment page.
   */</span>
  cancelUrl<span class="token operator">:</span> <span class="token builtin">string</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Payment</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Regarding automatic payment
   * - True: Processing authorization and purchase with the Confirm API at the same time
   * - False: Authorized with the Confirm API but need to purchase with the Capture API.
   *
   * Note that this field is not available by default. Users should contact LINE Pay to activate manually.
   */</span>
  capture<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">boolean</span>
  <span class="token doc-comment comment">/**
   * Payment options
   * - NORMAL
   * - PREAPPROVED
   */</span>
  payType<span class="token operator">?</span><span class="token operator">:</span> <span class="token string">&#39;NORMAL&#39;</span> <span class="token operator">|</span> <span class="token string">&#39;PREAPPROVED&#39;</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Display</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Language codes of the payment standby screen. The default language is English (en).
   * - Supported languages: en, ja, ko, th, zh_TW, zh_CN
   */</span>
  locale<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Checking the payment browser when moving to the ConfirmURL
   * - True : Guide user to go to the LINE Pay payment request browser if payment request browser and the ConfirmURL navigation browser are different.
   * - False : Move the the ConfirmURL immediately without checking the browser
   */</span>
  checkConfirmUrlBrowser<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">boolean</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Shipping</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Shipping address options
   * - NO_SHIPPING
   * - FIXED_ADDRESS
   * - SHIPPING
   */</span>
  type<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping fee
   */</span>
  feeAmount<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * A URL to check shipping method
   */</span>
  feeInquiryUrl<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping fee options
   * - CONDITION : Check the shipping method (fee) when the shipping address is changed.
   * - FIXED : If fixed, not checking the shipping address even after it is changed.
   */</span>
  feeInquiryType<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping address
   */</span>
  address<span class="token operator">?</span><span class="token operator">:</span> Address
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">AddFriend</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Service type of the friend add list
   * - lineAt
   */</span>
  type<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * A list of ID by service
   */</span>
  idList<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span><span class="token punctuation">[</span><span class="token punctuation">]</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">FamilyService</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Service type of the family service list
   */</span>
  addFriends<span class="token operator">?</span><span class="token operator">:</span> AddFriend<span class="token punctuation">[</span><span class="token punctuation">]</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Extra</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Branch Name where the payment is requested from (Only 100 letters will be displayed if it&#39;s exceeded.)
   */</span>
  branchName<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Branch Id where the payment is requested.\\
   * It can be support alphabets, numbers and special characters.
   */</span>
  branchId<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Options</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Payment options
   */</span>
  payment<span class="token operator">?</span><span class="token operator">:</span> Payment
  <span class="token doc-comment comment">/**
   * Display options
   */</span>
  display<span class="token operator">?</span><span class="token operator">:</span> Display
  <span class="token doc-comment comment">/**
   * Shipping options
   */</span>
  shipping<span class="token operator">?</span><span class="token operator">:</span> Shipping
  <span class="token doc-comment comment">/**
   * Family service options
   */</span>
  familyService<span class="token operator">?</span><span class="token operator">:</span> FamilyService
  <span class="token doc-comment comment">/**
   * Extra options
   */</span>
  extra<span class="token operator">?</span><span class="token operator">:</span> Extra
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">RequestRequestBody</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Payment amount\\
   * \`= sum(packages[].amount) + sum(packages[].userFee) + options.shipping.feeAmount\`
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Payment currency (ISO 4217)
   * - Supported currencies: USD, JPY, TWD, THB
   */</span>
  currency<span class="token operator">:</span> Currency
  <span class="token doc-comment comment">/**
   * An order ID of payment request from the merchant
   * - An unique ID managed by the merchant
   */</span>
  orderId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Package list
   */</span>
  packages<span class="token operator">:</span> Package<span class="token punctuation">[</span><span class="token punctuation">]</span>
  <span class="token doc-comment comment">/**
   * Redirect URLs
   */</span>
  redirectUrls<span class="token operator">:</span> RedirectUrls
  <span class="token doc-comment comment">/**
   * options
   */</span>
  options<span class="token operator">?</span><span class="token operator">:</span> Options
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">RequestRequestConfig</span> <span class="token operator">=</span> GeneralRequestConfig <span class="token operator">&amp;</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Request body of request API
   */</span>
  body<span class="token operator">:</span> RequestRequestBody
<span class="token punctuation">}</span>
</code></pre><div class="highlight-lines"><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><br><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div></div><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="response-body" tabindex="-1"><a class="header-anchor" href="#response-body" aria-hidden="true">#</a> Response Body</h3><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">PaymentUrl</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * App URL to move to the payment page
   * - Used when payment reservation is done in the app
   * - URL to move from the merchant app to the LINE Pay.
   */</span>
  app<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * 	Web URL to move to the payment page
   * - Used when payment reservation is done in the web
   * - URL to move to the LINE Pay payment standby page
   * - Move to URL that is delivered without particular parameter
   * - If opening a pop-up in the desktop, follow the size: Width: 700px, Height : 546px
   */</span>
  web<span class="token operator">:</span> <span class="token builtin">string</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Info</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Transaction ID
   */</span>
  transactionId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * The code value entered when code is used instead of scanner in the LINE Pay.
   */</span>
  paymentAccessToken<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Payment URL
   */</span>
  paymentUrl<span class="token operator">:</span> PaymentUrl
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">RequestResponseBody</span> <span class="token operator">=</span> GeneralResponseBody <span class="token operator">&amp;</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Payment information
   */</span>
  info<span class="token operator">:</span> Info
<span class="token punctuation">}</span>
</code></pre><div class="highlight-lines"><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><br><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div></div><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="return-code" tabindex="-1"><a class="header-anchor" href="#return-code" aria-hidden="true">#</a> Return Code</h3><h4 id="success" tabindex="-1"><a class="header-anchor" href="#success" aria-hidden="true">#</a> Success</h4><table><thead><tr><th style="text-align:center;">Code</th><th style="text-align:left;">Description</th></tr></thead><tbody><tr><td style="text-align:center;">0000</td><td style="text-align:left;">Success</td></tr></tbody></table><h4 id="error" tabindex="-1"><a class="header-anchor" href="#error" aria-hidden="true">#</a> Error</h4><table><thead><tr><th style="text-align:center;">Code</th><th style="text-align:left;">Description</th></tr></thead><tbody><tr><td style="text-align:center;">1104</td><td style="text-align:left;">Non-existing merchant</td></tr><tr><td style="text-align:center;">1105</td><td style="text-align:left;">The merchant cannot use the LINE Pay.</td></tr><tr><td style="text-align:center;">1106</td><td style="text-align:left;">A header information error</td></tr><tr><td style="text-align:center;">1124</td><td style="text-align:left;">An amount info error</td></tr><tr><td style="text-align:center;">1145</td><td style="text-align:left;">Payment in process</td></tr><tr><td style="text-align:center;">1172</td><td style="text-align:left;">A record of transaction with the same order number already exists.</td></tr><tr><td style="text-align:center;">1178</td><td style="text-align:left;">Unsupported currency</td></tr><tr><td style="text-align:center;">1183</td><td style="text-align:left;">The payment amount must be less than 0.</td></tr><tr><td style="text-align:center;">1194</td><td style="text-align:left;">The merchant cannot use the preapproved payment.</td></tr><tr><td style="text-align:center;">2101</td><td style="text-align:left;">A parameter error</td></tr><tr><td style="text-align:center;">2102</td><td style="text-align:left;">A JSON data format error</td></tr><tr><td style="text-align:center;">9000</td><td style="text-align:left;">An internal error</td></tr></tbody></table><h3 id="example" tabindex="-1"><a class="header-anchor" href="#example" aria-hidden="true">#</a> Example</h3><h4 id="request" tabindex="-1"><a class="header-anchor" href="#request" aria-hidden="true">#</a> Request</h4><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">const</span> res <span class="token operator">=</span> <span class="token keyword">await</span> linePayClient<span class="token punctuation">.</span>request<span class="token punctuation">.</span><span class="token function">send</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
  body<span class="token operator">:</span> <span class="token punctuation">{</span>
    amount<span class="token operator">:</span> <span class="token number">1000</span><span class="token punctuation">,</span>
    currency<span class="token operator">:</span> <span class="token string">&#39;TWD&#39;</span><span class="token punctuation">,</span>
    orderId<span class="token operator">:</span> <span class="token string">&#39;20211209003&#39;</span><span class="token punctuation">,</span>
    packages<span class="token operator">:</span> <span class="token punctuation">[</span>
      <span class="token punctuation">{</span>
        id<span class="token operator">:</span> <span class="token string">&#39;c99abc79-3b29-4f40-8851-bc618ca57857&#39;</span><span class="token punctuation">,</span>
        amount<span class="token operator">:</span> <span class="token number">1000</span><span class="token punctuation">,</span>
        products<span class="token operator">:</span> <span class="token punctuation">[</span>
          <span class="token punctuation">{</span>
            name<span class="token operator">:</span> <span class="token string">&#39;Demo Product&#39;</span><span class="token punctuation">,</span>
            quantity<span class="token operator">:</span> <span class="token number">2</span><span class="token punctuation">,</span>
            price<span class="token operator">:</span> <span class="token number">500</span>
          <span class="token punctuation">}</span>
        <span class="token punctuation">]</span>
      <span class="token punctuation">}</span>
    <span class="token punctuation">]</span><span class="token punctuation">,</span>
    redirectUrls<span class="token operator">:</span> <span class="token punctuation">{</span>
      confirmUrl<span class="token operator">:</span> <span class="token string">&#39;https://example.com/confirmUrl&#39;</span><span class="token punctuation">,</span>
      cancelUrl<span class="token operator">:</span> <span class="token string">&#39;https://example.com/cancelUrl&#39;</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">}</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h4 id="response" tabindex="-1"><a class="header-anchor" href="#response" aria-hidden="true">#</a> Response</h4><div class="language-json ext-json line-numbers-mode"><pre class="language-json"><code><span class="token punctuation">{</span>
  <span class="token property">&quot;body&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span>
    <span class="token property">&quot;returnCode&quot;</span><span class="token operator">:</span> <span class="token string">&quot;0000&quot;</span><span class="token punctuation">,</span>
    <span class="token property">&quot;returnMessage&quot;</span><span class="token operator">:</span> <span class="token string">&quot;Success.&quot;</span><span class="token punctuation">,</span>
    <span class="token property">&quot;info&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span>
      <span class="token property">&quot;paymentUrl&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span>
        <span class="token property">&quot;web&quot;</span><span class="token operator">:</span> <span class="token string">&quot;https://sandbox-web-pay.line.me/web/payment/wait?transactionReserveId=eVBISG5rQ09QL2JBVmJsdGdGN3RiUlBLaU0vMUtKWGEvVzhZS3o5NnBvSUlqZXdLdXk3Wlh0RXY2a0o3ZHp6Yw&quot;</span><span class="token punctuation">,</span>
        <span class="token property">&quot;app&quot;</span><span class="token operator">:</span> <span class="token string">&quot;line://pay/payment/eVBISG5rQ09QL2JBVmJsdGdGN3RiUlBLaU0vMUtKWGEvVzhZS3o5NnBvSUlqZXdLdXk3Wlh0RXY2a0o3ZHp6Yw&quot;</span>
      <span class="token punctuation">}</span><span class="token punctuation">,</span>
      <span class="token property">&quot;transactionId&quot;</span><span class="token operator">:</span> <span class="token string">&quot;2021121600698709710&quot;</span><span class="token punctuation">,</span>
      <span class="token property">&quot;paymentAccessToken&quot;</span><span class="token operator">:</span> <span class="token string">&quot;656097936065&quot;</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token property">&quot;comments&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span><span class="token punctuation">}</span>
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="addhandler" tabindex="-1"><a class="header-anchor" href="#addhandler" aria-hidden="true">#</a> addHandler</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">addHandler</span><span class="token punctuation">(</span>handler<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>RequestClient</code></p><p>Example:</p><div class="language-javascript ext-js line-numbers-mode"><pre class="language-javascript"><code>client<span class="token punctuation">.</span><span class="token function">addHandler</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> type<span class="token punctuation">,</span> req<span class="token punctuation">,</span> next<span class="token punctuation">,</span> httpClient <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token punctuation">{</span>
  console<span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>type<span class="token punctuation">)</span> <span class="token comment">// request</span>
  <span class="token keyword">return</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="addhandlers" tabindex="-1"><a class="header-anchor" href="#addhandlers" aria-hidden="true">#</a> addHandlers</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">addHandlers</span><span class="token punctuation">(</span><span class="token operator">...</span>handlers<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>RequestClient</code></p><p>Example:</p><div class="language-javascript ext-js line-numbers-mode"><pre class="language-javascript"><code>client<span class="token punctuation">.</span><span class="token function">addHandlers</span><span class="token punctuation">(</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span>
<span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div>`,31),l=[t];function p(o,c){return s(),a("div",null,l)}var d=n(i,[["render",p],["__file","request.html.vue"]]);export{d as default};
