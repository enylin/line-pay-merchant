import{_ as t,r as i,o as l,c as r,a as s,b as a,e as n,d as o}from"./app.951013b3.js";const c={},d=s("h1",{id:"confirm-api",tabindex:"-1"},[s("a",{class:"header-anchor",href:"#confirm-api","aria-hidden":"true"},"#"),n(" Confirm API")],-1),p=s("h2",{id:"overview",tabindex:"-1"},[s("a",{class:"header-anchor",href:"#overview","aria-hidden":"true"},"#"),n(" Overview")],-1),u=n("An API for the merchant to complete the payment when the user approves with the "),v={href:"https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec",target:"_blank",rel:"noopener noreferrer"},m=n("ConfirmURL"),h=n(" or "),b={href:"https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api",target:"_blank",rel:"noopener noreferrer"},k=n("Check Payment Status API"),g=n(". Status of a payment where authorization and purchase are separated because 'options.payment.confirm' of the Request API is set as "),y=s("code",null,"false",-1),f=n(" will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the "),x={href:"https://pay.line.me/documents/online_v3_en.html?shell#confirm-api",target:"_blank",rel:"noopener noreferrer"},q=n("Confirm API"),_=n("."),I=o(`<ul><li><a href="#send"><code>send</code></a></li><li><a href="#addhandler"><code>addHandler</code></a></li><li><a href="#addhandlers"><code>addHandlers</code></a></li></ul><h2 id="send" tabindex="-1"><a class="header-anchor" href="#send" aria-hidden="true">#</a> send</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">send</span><span class="token punctuation">(</span>confirmRequestConfig<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>Promise&lt;ApiResponse&lt;ConfirmResponseBody&gt;&gt;</code></p><h3 id="request-config" tabindex="-1"><a class="header-anchor" href="#request-config" aria-hidden="true">#</a> Request Config</h3><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">ConfirmRequestBody</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Payment amount
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Payment currency ([ISO 4217](https://en.wikipedia.org/wiki/ISO_4217))\\
   * Supported currencies are as follows.
   * - USD
   * - JPY
   * - TWD
   * - THB
   */</span>
  currency<span class="token operator">:</span> Currency
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">ConfirmRequestConfig</span> <span class="token operator">=</span> GeneralRequestConfig <span class="token operator">&amp;</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * ID of the transaction
   */</span>
  transactionId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Request body of confirm API
   */</span>
  body<span class="token operator">:</span> ConfirmRequestBody
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="response-body" tabindex="-1"><a class="header-anchor" href="#response-body" aria-hidden="true">#</a> Response Body</h3><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">PayInfo</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * A payment method used for payment
   * - Credit card: CREDIT_CARD
   * - Balance: BALANCE
   * - Discount: DISCOUNT
   */</span>
  method<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Payment amount
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Credit card nickname for automatic payment
   * - Credit card name managed at LINE Pay. It is the name registered when registered to LINE Pay.
   * - If LINE Pay user does not set a nickname, an empty string will be sent.
   * - The nickname can be changed upon user&#39;s request and the change history will not be shared with the merchant.
   */</span>
  creditCardNickname<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Credit card brand used for automatic payment
   * - VISA
   * - MASTER
   * - AMEX
   * - DINERS
   * - JCB
   */</span>
  creditCardBrand<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Masked credit card number (Send only for Taiwan merchants. Able to use the feature when requesting to the merchant center manager. Not sending in payment details API).
   * - Format: **** **** **** 1234
   */</span>
  maskedCreditCardNumber<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Package</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * An unique ID of package list
   */</span>
  id<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Name of the sales products
   */</span>
  name<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Total amount of products per package\\
   * \`=sum(products[].quantity * products[].price)\`
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * User fee: Sent as a respond if a list of fee is found within the payment amount.
   */</span>
  userFeeAmount<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">number</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Shipping</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * An ID of shipping method selected by user
   */</span>
  methodId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping fee
   */</span>
  feeAmount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Shipping address
   */</span>
  address<span class="token operator">:</span> Address
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Info</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * An unique order ID of the merchant sent upon requesting the payment.
   */</span>
  orderId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Transaction ID
   */</span>
  transactionId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Authentication expiration date and time (ISO 8601)
   * - Send if the payment proceeded only up to authentication (capture=false)
   */</span>
  authorizationExpireDate<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * A key for automatic payment (15 digits)
   */</span>
  regKey<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Payment information
   */</span>
  payInfo<span class="token operator">:</span> PayInfo<span class="token punctuation">[</span><span class="token punctuation">]</span>
  <span class="token doc-comment comment">/**
   * Package information
   */</span>
  packages<span class="token operator">:</span> Package<span class="token punctuation">[</span><span class="token punctuation">]</span>
  <span class="token doc-comment comment">/**
   * Shipping information
   */</span>
  shipping<span class="token operator">?</span><span class="token operator">:</span> Shipping
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">ConfirmResponseBody</span> <span class="token operator">=</span> GeneralResponseBody <span class="token operator">&amp;</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Payment information
   */</span>
  info<span class="token operator">:</span> Info
<span class="token punctuation">}</span>
</code></pre><div class="highlight-lines"><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><br><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><br><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div><div class="highlight-line">\xA0</div></div><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="return-code" tabindex="-1"><a class="header-anchor" href="#return-code" aria-hidden="true">#</a> Return Code</h3><h4 id="success" tabindex="-1"><a class="header-anchor" href="#success" aria-hidden="true">#</a> Success</h4><table><thead><tr><th style="text-align:center;">Code</th><th style="text-align:left;">Description</th></tr></thead><tbody><tr><td style="text-align:center;">0000</td><td style="text-align:left;">Success</td></tr></tbody></table><h4 id="error" tabindex="-1"><a class="header-anchor" href="#error" aria-hidden="true">#</a> Error</h4><table><thead><tr><th style="text-align:center;">Code</th><th style="text-align:left;">Description</th></tr></thead><tbody><tr><td style="text-align:center;">1101</td><td style="text-align:left;">Not a LINE Pay member</td></tr><tr><td style="text-align:center;">1102</td><td style="text-align:left;">The member is unable to proceed the transaction.</td></tr><tr><td style="text-align:center;">1104</td><td style="text-align:left;">Non-existing merchant</td></tr><tr><td style="text-align:center;">1105</td><td style="text-align:left;">The merchant cannot use the LINE Pay.</td></tr><tr><td style="text-align:center;">1106</td><td style="text-align:left;">A header info error</td></tr><tr><td style="text-align:center;">1110</td><td style="text-align:left;">Unacceptable credit card</td></tr><tr><td style="text-align:center;">1124</td><td style="text-align:left;">Amount info error (scale)</td></tr><tr><td style="text-align:center;">1141</td><td style="text-align:left;">A payment account error</td></tr><tr><td style="text-align:center;">1142</td><td style="text-align:left;">Low balance</td></tr><tr><td style="text-align:center;">1150</td><td style="text-align:left;">Cannot find the transaction history</td></tr><tr><td style="text-align:center;">1152</td><td style="text-align:left;">There is a history of transactions with the same transactionId.</td></tr><tr><td style="text-align:center;">1153</td><td style="text-align:left;">The payment amount is different than the requested amount.</td></tr><tr><td style="text-align:center;">1159</td><td style="text-align:left;">Payment request information is not found.</td></tr><tr><td style="text-align:center;">1169</td><td style="text-align:left;">Must select a payment method and password authentication at the LINE Pay.</td></tr><tr><td style="text-align:center;">1170</td><td style="text-align:left;">Balance of the member&#39;s account has been changed.</td></tr><tr><td style="text-align:center;">1172</td><td style="text-align:left;">A record of transaction with the same order number already exists.</td></tr><tr><td style="text-align:center;">1180</td><td style="text-align:left;">The payment has been expired.</td></tr><tr><td style="text-align:center;">1198</td><td style="text-align:left;">API call request has been duplicated.</td></tr><tr><td style="text-align:center;">1199</td><td style="text-align:left;">Internal request error</td></tr><tr><td style="text-align:center;">1280</td><td style="text-align:left;">A temporary error occurred while processing the credit card payment.</td></tr><tr><td style="text-align:center;">1281</td><td style="text-align:left;">A credit card payment error</td></tr><tr><td style="text-align:center;">1282</td><td style="text-align:left;">A credit card authorization error</td></tr><tr><td style="text-align:center;">1283</td><td style="text-align:left;">The payment was refused due to suspected fraud.</td></tr><tr><td style="text-align:center;">1284</td><td style="text-align:left;">The credit card payment has temporarily stopped.</td></tr><tr><td style="text-align:center;">1285</td><td style="text-align:left;">Missing credit card payment information</td></tr><tr><td style="text-align:center;">1286</td><td style="text-align:left;">Wrong credit card payment information</td></tr><tr><td style="text-align:center;">1287</td><td style="text-align:left;">The credit card has been expired</td></tr><tr><td style="text-align:center;">1288</td><td style="text-align:left;">The credit card has low balance</td></tr><tr><td style="text-align:center;">1289</td><td style="text-align:left;">Exceeded the credit card limit</td></tr><tr><td style="text-align:center;">1290</td><td style="text-align:left;">Exceeded the limit of the credit card per payment</td></tr><tr><td style="text-align:center;">1291</td><td style="text-align:left;">The card has been reported as a stolen card.</td></tr><tr><td style="text-align:center;">1292</td><td style="text-align:left;">The card has been suspended.</td></tr><tr><td style="text-align:center;">1293</td><td style="text-align:left;">A CVN input error</td></tr><tr><td style="text-align:center;">1294</td><td style="text-align:left;">The card is listed on the blacklist.</td></tr><tr><td style="text-align:center;">1295</td><td style="text-align:left;">A wrong credit card number</td></tr><tr><td style="text-align:center;">1296</td><td style="text-align:left;">Unable to proceed the amount</td></tr><tr><td style="text-align:center;">1298</td><td style="text-align:left;">The card has been declined.</td></tr><tr><td style="text-align:center;">9000</td><td style="text-align:left;">An internal error</td></tr></tbody></table><h3 id="example" tabindex="-1"><a class="header-anchor" href="#example" aria-hidden="true">#</a> Example</h3><h4 id="request" tabindex="-1"><a class="header-anchor" href="#request" aria-hidden="true">#</a> Request</h4><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">const</span> res <span class="token operator">=</span> <span class="token keyword">await</span> linePayClient<span class="token punctuation">.</span>confirm
  <span class="token punctuation">.</span><span class="token function">send</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
    transactionId<span class="token operator">:</span> <span class="token string">&#39;2021121600698709510&#39;</span><span class="token punctuation">,</span>
    body<span class="token operator">:</span> <span class="token punctuation">{</span>
      currency<span class="token operator">:</span> <span class="token string">&#39;TWD&#39;</span><span class="token punctuation">,</span>
      amount<span class="token operator">:</span> <span class="token number">1000</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">}</span><span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h4 id="response" tabindex="-1"><a class="header-anchor" href="#response" aria-hidden="true">#</a> Response</h4><div class="language-json ext-json line-numbers-mode"><pre class="language-json"><code><span class="token punctuation">{</span>
  <span class="token property">&quot;body&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span>
    <span class="token property">&quot;returnCode&quot;</span><span class="token operator">:</span> <span class="token string">&quot;0000&quot;</span><span class="token punctuation">,</span>
    <span class="token property">&quot;returnMessage&quot;</span><span class="token operator">:</span> <span class="token string">&quot;Success.&quot;</span><span class="token punctuation">,</span>
    <span class="token property">&quot;info&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span>
      <span class="token property">&quot;transactionId&quot;</span><span class="token operator">:</span> <span class="token string">&quot;2021121600698709510&quot;</span><span class="token punctuation">,</span>
      <span class="token property">&quot;orderId&quot;</span><span class="token operator">:</span> <span class="token string">&quot;20211216002&quot;</span><span class="token punctuation">,</span>
      <span class="token property">&quot;payInfo&quot;</span><span class="token operator">:</span> <span class="token punctuation">[</span>
        <span class="token punctuation">{</span>
          <span class="token property">&quot;method&quot;</span><span class="token operator">:</span> <span class="token string">&quot;CREDIT_CARD&quot;</span><span class="token punctuation">,</span>
          <span class="token property">&quot;amount&quot;</span><span class="token operator">:</span> <span class="token number">1000</span><span class="token punctuation">,</span>
        <span class="token punctuation">}</span>
      <span class="token punctuation">]</span><span class="token punctuation">,</span>
      <span class="token property">&quot;packages&quot;</span><span class="token operator">:</span> <span class="token punctuation">[</span>
        <span class="token punctuation">{</span>
          <span class="token property">&quot;id&quot;</span><span class="token operator">:</span> <span class="token string">&quot;c99abc79-3b29-4f40-8851-bc618ca57857&quot;</span><span class="token punctuation">,</span>
          <span class="token property">&quot;amount&quot;</span><span class="token operator">:</span> <span class="token number">1000</span><span class="token punctuation">,</span>
          <span class="token property">&quot;userFeeAmount&quot;</span><span class="token operator">:</span> <span class="token number">0</span><span class="token punctuation">,</span>
          <span class="token property">&quot;products&quot;</span><span class="token operator">:</span> <span class="token punctuation">[</span>
            <span class="token punctuation">{</span>
              <span class="token property">&quot;name&quot;</span><span class="token operator">:</span> <span class="token string">&quot;Demo Product&quot;</span><span class="token punctuation">,</span>
              <span class="token property">&quot;quantity&quot;</span><span class="token operator">:</span> <span class="token number">2</span><span class="token punctuation">,</span>
              <span class="token property">&quot;price&quot;</span><span class="token operator">:</span> <span class="token number">500</span>
            <span class="token punctuation">}</span>
          <span class="token punctuation">]</span>
        <span class="token punctuation">}</span>
      <span class="token punctuation">]</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token property">&quot;comments&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span><span class="token punctuation">}</span>
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="addhandler" tabindex="-1"><a class="header-anchor" href="#addhandler" aria-hidden="true">#</a> addHandler</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">addHandler</span><span class="token punctuation">(</span>handler<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>ConfirmClient</code></p><p>Example:</p><div class="language-javascript ext-js line-numbers-mode"><pre class="language-javascript"><code>client<span class="token punctuation">.</span><span class="token function">addHandler</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> type<span class="token punctuation">,</span> req<span class="token punctuation">,</span> next<span class="token punctuation">,</span> httpClient <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token punctuation">{</span>
  console<span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>type<span class="token punctuation">)</span> <span class="token comment">// confirm</span>
  <span class="token keyword">return</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="addhandlers" tabindex="-1"><a class="header-anchor" href="#addhandlers" aria-hidden="true">#</a> addHandlers</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">addHandlers</span><span class="token punctuation">(</span><span class="token operator">...</span>handlers<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>ConfirmClient</code></p><p>Example:</p><div class="language-javascript ext-js line-numbers-mode"><pre class="language-javascript"><code>client<span class="token punctuation">.</span><span class="token function">addHandlers</span><span class="token punctuation">(</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span>
<span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div>`,28);function w(C,A){const e=i("ExternalLinkIcon");return l(),r("div",null,[d,p,s("p",null,[u,s("a",v,[m,a(e)]),h,s("a",b,[k,a(e)]),g,y,f,s("a",x,[q,a(e)]),_]),I])}var R=t(c,[["render",w],["__file","confirm.html.vue"]]);export{R as default};
