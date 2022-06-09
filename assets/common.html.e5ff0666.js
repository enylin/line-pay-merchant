import{_ as n,o as s,c as e,d as a}from"./app.951013b3.js";const i={},o=a(`<h1 id="common-types" tabindex="-1"><a class="header-anchor" href="#common-types" aria-hidden="true">#</a> Common Types</h1><h2 id="general-request-config" tabindex="-1"><a class="header-anchor" href="#general-request-config" aria-hidden="true">#</a> General Request Config</h2><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">GeneralRequestConfig</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * API timeout
   */</span>
  timeout<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">number</span>
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="general-response-body" tabindex="-1"><a class="header-anchor" href="#general-response-body" aria-hidden="true">#</a> General Response Body</h2><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">GeneralResponseBody</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Return code
   */</span>
  returnCode<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Return message
   * Return message or reason for failure. The following are examples.
   * - Unpayable merchant
   * - Merchant authentication information error
   */</span>
  returnMessage<span class="token operator">:</span> <span class="token builtin">string</span>
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="api-response" tabindex="-1"><a class="header-anchor" href="#api-response" aria-hidden="true">#</a> API Response</h2><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">ApiResponse<span class="token operator">&lt;</span>Body <span class="token keyword">extends</span> GeneralResponseBody<span class="token operator">&gt;</span></span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Response body
   */</span>
  body<span class="token operator">:</span> Body
  <span class="token doc-comment comment">/**
   * Additional comments may be added by handlers
   */</span>
  comments<span class="token operator">:</span> Record<span class="token operator">&lt;</span><span class="token builtin">string</span><span class="token punctuation">,</span> <span class="token builtin">unknown</span><span class="token operator">&gt;</span>
<span class="token punctuation">}</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div><h2 id="other-common-types" tabindex="-1"><a class="header-anchor" href="#other-common-types" aria-hidden="true">#</a> Other Common Types</h2><div class="language-typescript ext-ts line-numbers-mode"><pre class="language-typescript"><code><span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Recipient</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Recipient name
   */</span>
  firstName<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Recipient last name
   */</span>
  lastName<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Additional information of the recipient first name
   */</span>
  firstNameOptional<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Additional information of the recipient last name
   */</span>
  lastNameOptional<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Email of the recipient
   */</span>
  email<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Phone number of the recipient
   */</span>
  phoneNo<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Address</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * Shipping country
   */</span>
  country<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping postal code
   */</span>
  postalCode<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping region
   */</span>
  state<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping address
   */</span>
  city<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Shipping detail
   */</span>
  detail<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Additional information of the shipping address
   */</span>
  optional<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Recipient of the shipping address
   */</span>
  recipient<span class="token operator">?</span><span class="token operator">:</span> Recipient
<span class="token punctuation">}</span>

<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Product</span> <span class="token operator">=</span> <span class="token punctuation">{</span>
  <span class="token doc-comment comment">/**
   * ID of sales products of the merchant
   */</span>
  id<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Name of the sales products
   */</span>
  name<span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * Image URL of the sales products
   */</span>
  imageUrl<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">string</span>
  <span class="token doc-comment comment">/**
   * 	Number of products
   */</span>
  quantity<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Price of each product
   */</span>
  price<span class="token operator">:</span> <span class="token builtin">number</span>
  <span class="token doc-comment comment">/**
   * Original price of each product
   */</span>
  originalPrice<span class="token operator">?</span><span class="token operator">:</span> <span class="token builtin">number</span>
<span class="token punctuation">}</span>

<span class="token doc-comment comment">/**
 * Payment currency (ISO 4217)
 */</span>
<span class="token keyword">export</span> <span class="token keyword">type</span> <span class="token class-name">Currency</span> <span class="token operator">=</span> <span class="token string">&#39;USD&#39;</span> <span class="token operator">|</span> <span class="token string">&#39;JPY&#39;</span> <span class="token operator">|</span> <span class="token string">&#39;TWD&#39;</span> <span class="token operator">|</span> <span class="token string">&#39;THB&#39;</span>
</code></pre><div class="line-numbers" aria-hidden="true"><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div><div class="line-number"></div></div></div>`,9),l=[o];function t(c,p){return s(),e("div",null,l)}var d=n(i,[["render",t],["__file","common.html.vue"]]);export{d as default};
