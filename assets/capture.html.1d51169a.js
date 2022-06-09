import{_ as n,o as s,c as a,d as e}from"./app.951013b3.js";const t={},i=e(`<h1 id="capture-api" tabindex="-1"><a class="header-anchor" href="#capture-api" aria-hidden="true">#</a> Capture API</h1><h2 id="overview" tabindex="-1"><a class="header-anchor" href="#overview" aria-hidden="true">#</a> Overview</h2><p>Transactions that have set options.payment.capture as <code>false</code> when requesting the Request API payment will be put on hold when the payment is completed with the Confirm API. In order to finalize the payment, an additional purchase with Capture API is required.</p><ul><li><a href="#send"><code>send</code></a></li><li><a href="#addhandler"><code>addHandler</code></a></li><li><a href="#addhandlers"><code>addHandlers</code></a></li></ul><h2 id="send" tabindex="-1"><a class="header-anchor" href="#send" aria-hidden="true">#</a> send</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">send</span><span class="token punctuation">(</span>captureRequestConfig<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>Promise&lt;ApiResponse&lt;CaptureResponseBody&gt;&gt;</code></p><h3 id="request-config" tabindex="-1"><a class="header-anchor" href="#request-config" aria-hidden="true">#</a> Request Config</h3><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Options</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  extra<span class="token operator">:</span> <span class="token punctuation">{</span>
    <span class="token doc-comment comment">/**
     * \u9EDE\u6578\u9650\u5236\u8CC7\u8A0A (Taiwan only)
     *
     * - useLimit: \u4E0D\u53EF\u4F7F\u7528\u9EDE\u6578\u6298\u62B5\u7684\u91D1\u984D
     * - rewardLimit: \u4E0D\u53EF\u56DE\u994B\u9EDE\u6578\u7684\u91D1\u984D
     * \`\`\`json
     * &quot;promotionRestriction&quot;: <span class="token punctuation">{</span>
     *     &quot;useLimit&quot;: 100,
     *     &quot;rewardLimit&quot;: 100
     * <span class="token punctuation">}</span>
     * \`\`\`
     */</span>
    promotionRestriction<span class="token operator">:</span> Record<span class="token operator">&lt;</span><span class="token builtin">string</span><span class="token punctuation">,</span> <span class="token builtin">unknown</span><span class="token operator">&gt;</span>
  <span class="token punctuation">}</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">CaptureRequestBody</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Payment amount
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Payment currency (ISO 4217)
   * - Supported currencies: USD, JPY, TWD, THB
   */</span>
  currency<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Options
   */</span>
  options<span class="token operator">?</span><span class="token operator">:</span> Options
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">CaptureRequestConfig</span> <span class="token operator">=</span> GeneralRequestConfig <span class="token operator">&amp;</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * ID of the transaction
   */</span>
  transactionId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Request body of capture API
   */</span>
  body<span class="token operator">:</span> CaptureRequestBody
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="response-body" tabindex="-1"><a class="header-anchor" href="#response-body" aria-hidden="true">#</a> Response Body</h3><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">PayInfo</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * A payment method used to process the payment
   * - Credit card: CREDIT_CARD
   * - Balance: BALANCE
   * - Discount: DISCOUNT
   */</span>
  method<span class="token operator">:</span> <span class="token string">&#39;CREDIT_CARD&#39;</span> <span class="token operator">|</span> <span class="token string">&#39;BALANCE&#39;</span> <span class="token operator">|</span> <span class="token string">&#39;DISCOUNT&#39;</span>
  <span class="token doc-comment comment">/**
   * Payment amount
   */</span>
  amount<span class="token operator">:</span> <span class="token builtin">number</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Info</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * An order ID sent from the merchant when reserving a payment.
   */</span>
  orderId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * A transaction ID returned as the payment reservation result (19 digits).
   */</span>
  transactionId<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Payment information
   */</span>
  payInfo<span class="token operator">:</span> PayInfo<span class="token punctuation">[</span><span class="token punctuation">]</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">CaptureResponseBody</span> <span class="token operator">=</span> GeneralResponseBody <span class="token operator">&amp;</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Capture information
   */</span>
  info<span class="token operator">:</span> Info
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h3 id="return-code" tabindex="-1"><a class="header-anchor" href="#return-code" aria-hidden="true">#</a> Return Code</h3><h4 id="success" tabindex="-1"><a class="header-anchor" href="#success" aria-hidden="true">#</a> Success</h4><table><thead><tr><th style="text-align:center;">Code</th><th style="text-align:left;">Description</th></tr></thead><tbody><tr><td style="text-align:center;">0000</td><td style="text-align:left;">Success</td></tr></tbody></table><h4 id="error" tabindex="-1"><a class="header-anchor" href="#error" aria-hidden="true">#</a> Error</h4><table><thead><tr><th style="text-align:center;">Code</th><th style="text-align:left;">Description</th></tr></thead><tbody><tr><td style="text-align:center;">1104</td><td style="text-align:left;">Non-existing merchant</td></tr><tr><td style="text-align:center;">1105</td><td style="text-align:left;">The merchant cannot use the LINE Pay.</td></tr><tr><td style="text-align:center;">1106</td><td style="text-align:left;">A header info error</td></tr><tr><td style="text-align:center;">1150</td><td style="text-align:left;">Cannot find the transaction history</td></tr><tr><td style="text-align:center;">1155</td><td style="text-align:left;">Wrong transaction number</td></tr><tr><td style="text-align:center;">1170</td><td style="text-align:left;">Balance of the member&#39;s account has been changed.</td></tr><tr><td style="text-align:center;">1172</td><td style="text-align:left;">A record of transaction with the same order number already exists.</td></tr><tr><td style="text-align:center;">1179</td><td style="text-align:left;">Unable to proceed the transaction.</td></tr><tr><td style="text-align:center;">1183</td><td style="text-align:left;">The payment amount should be greater than 0.</td></tr><tr><td style="text-align:center;">1184</td><td style="text-align:left;">The payment amount exceeds requested amount.</td></tr><tr><td style="text-align:center;">1198</td><td style="text-align:left;">Either API call has been duplicated or purchase API has been called while re-authorization was automatically processed (Repeat after several minutes).</td></tr><tr><td style="text-align:center;">1199</td><td style="text-align:left;">Internal request error</td></tr><tr><td style="text-align:center;">1280</td><td style="text-align:left;">A temporary error occurred while processing the credit card payment.</td></tr><tr><td style="text-align:center;">1281</td><td style="text-align:left;">A credit card payment error</td></tr><tr><td style="text-align:center;">1282</td><td style="text-align:left;">A credit card authorization error</td></tr><tr><td style="text-align:center;">1283</td><td style="text-align:left;">The payment was refused due to suspected fraud.</td></tr><tr><td style="text-align:center;">1284</td><td style="text-align:left;">The credit card payment has temporarily stopped.</td></tr><tr><td style="text-align:center;">1285</td><td style="text-align:left;">Missing credit card payment information</td></tr><tr><td style="text-align:center;">1286</td><td style="text-align:left;">Wrong credit card payment information</td></tr><tr><td style="text-align:center;">1287</td><td style="text-align:left;">The credit card has been expired</td></tr><tr><td style="text-align:center;">1288</td><td style="text-align:left;">The credit card has low balance</td></tr><tr><td style="text-align:center;">1289</td><td style="text-align:left;">Exceeded the credit card limit</td></tr><tr><td style="text-align:center;">1290</td><td style="text-align:left;">Exceeded the limit of the credit card per payment</td></tr><tr><td style="text-align:center;">1291</td><td style="text-align:left;">The card has been reported as a stolen card.</td></tr><tr><td style="text-align:center;">1292</td><td style="text-align:left;">The card has been suspended.</td></tr><tr><td style="text-align:center;">1293</td><td style="text-align:left;">A CVN input error</td></tr><tr><td style="text-align:center;">1294</td><td style="text-align:left;">The card is listed on the blacklist.</td></tr><tr><td style="text-align:center;">1295</td><td style="text-align:left;">A wrong credit card number</td></tr><tr><td style="text-align:center;">1296</td><td style="text-align:left;">Unable to proceed the amount</td></tr><tr><td style="text-align:center;">1298</td><td style="text-align:left;">The card has been declined.</td></tr><tr><td style="text-align:center;">9000</td><td style="text-align:left;">An internal error</td></tr></tbody></table><h3 id="example" tabindex="-1"><a class="header-anchor" href="#example" aria-hidden="true">#</a> Example</h3><h4 id="request" tabindex="-1"><a class="header-anchor" href="#request" aria-hidden="true">#</a> Request</h4><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">const</span> res <span class="token operator">=</span> <span class="token keyword">await</span> linePayClient<span class="token punctuation">.</span>capture
  <span class="token punctuation">.</span><span class="token function">send</span><span class="token punctuation">(</span><span class="token punctuation">{</span>
    transactionId<span class="token operator">:</span> <span class="token string">&#39;2021121300698360310&#39;</span><span class="token punctuation">,</span>
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
      <span class="token property">&quot;transactionId&quot;</span><span class="token operator">:</span> <span class="token string">&quot;2021121300698360310&quot;</span><span class="token punctuation">,</span>
      <span class="token property">&quot;orderId&quot;</span><span class="token operator">:</span> <span class="token string">&quot;20211216002&quot;</span><span class="token punctuation">,</span>
      <span class="token property">&quot;payInfo&quot;</span><span class="token operator">:</span> <span class="token punctuation">[</span><span class="token punctuation">{</span>
        <span class="token property">&quot;method&quot;</span><span class="token operator">:</span> <span class="token string">&quot;BALANCE&quot;</span><span class="token punctuation">,</span>
        <span class="token property">&quot;amount&quot;</span><span class="token operator">:</span> <span class="token number">900</span>
      <span class="token punctuation">}</span><span class="token punctuation">,</span> <span class="token punctuation">{</span>
        <span class="token property">&quot;method&quot;</span><span class="token operator">:</span> <span class="token string">&quot;DISCOUNT&quot;</span><span class="token punctuation">,</span>
        <span class="token property">&quot;amount&quot;</span><span class="token operator">:</span> <span class="token number">100</span>
      <span class="token punctuation">}</span><span class="token punctuation">]</span>
    <span class="token punctuation">}</span>
  <span class="token punctuation">}</span><span class="token punctuation">,</span>
  <span class="token property">&quot;comments&quot;</span><span class="token operator">:</span> <span class="token punctuation">{</span><span class="token punctuation">}</span>
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="addhandler" tabindex="-1"><a class="header-anchor" href="#addhandler" aria-hidden="true">#</a> addHandler</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">addHandler</span><span class="token punctuation">(</span>handler<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>CaptureClient</code></p><p>Example:</p><div class="language-javascript ext-js line-numbers-mode"><pre class="language-javascript"><code>client<span class="token punctuation">.</span><span class="token function">addHandler</span><span class="token punctuation">(</span><span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> type<span class="token punctuation">,</span> req<span class="token punctuation">,</span> next<span class="token punctuation">,</span> httpClient <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token punctuation">{</span>
  console<span class="token punctuation">.</span><span class="token function">log</span><span class="token punctuation">(</span>type<span class="token punctuation">)</span> <span class="token comment">// capture</span>
  <span class="token keyword">return</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span>
<span class="token punctuation">}</span><span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="addhandlers" tabindex="-1"><a class="header-anchor" href="#addhandlers" aria-hidden="true">#</a> addHandlers</h2><div class="language-javascript ext-js"><pre class="language-javascript"><code><span class="token function">addHandlers</span><span class="token punctuation">(</span><span class="token operator">...</span>handlers<span class="token punctuation">)</span>
</code></pre></div><p>Returns <code>CaptureClient</code></p><p>Example:</p><div class="language-javascript ext-js line-numbers-mode"><pre class="language-javascript"><code>client<span class="token punctuation">.</span><span class="token function">addHandlers</span><span class="token punctuation">(</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span><span class="token punctuation">,</span>
  <span class="token punctuation">(</span><span class="token parameter"><span class="token punctuation">{</span> req<span class="token punctuation">,</span> next <span class="token punctuation">}</span></span><span class="token punctuation">)</span> <span class="token operator">=&gt;</span> <span class="token function">next</span><span class="token punctuation">(</span>req<span class="token punctuation">)</span>
<span class="token punctuation">)</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div>`,31),l=[i];function p(o,r){return s(),a("div",null,l)}var d=n(t,[["render",p],["__file","capture.html.vue"]]);export{d as default};
