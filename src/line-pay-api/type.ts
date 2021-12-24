/**
 * HTTP query string object
 */
export type QueryParams = Record<string, string | number | boolean | string[]>

/**
 * Empty Object
 */
export type EmptyObject = Record<string | number | symbol, never>

/**
 * LINE Pay API client builder
 *
 * @param httpClient http client communicate with LINE Pay API
 * @returns LINE Pay API request function
 */
export type ApiClientBuilder<Req, Res> = (
  httpClient: HttpClient
) => (req: Req) => Promise<Res>

export type LineMerchantConfig = {
  /**
   * Payment Integration Information - Channel ID
   */
  channelId: string
  /**
   * Required for the authentication. Secret key can be checked from the [merchant center](https://pay.line.me) after the merchant review is completed.
   */
  channelSecretKey: string
  /**
   * For synchronization, LINE Pay supports the Sandbox environment. You can check both test channel info (ID, SecretKey) usable in the Sandbox environment and actual channel info (ID, SecretKey) in the production environment from the merchant center.
   */
  env: 'development' | 'production'
  /**
   * Timeout for the request to the LINE Pay API.
   */
  timeout?: number
}

export type HttpResponse<R> = {
  /**
   * HTTP response body
   */
  data: R
  /**
   * HTTP status code
   */
  status: number
}

export type GeneralRequestConfig = {
  /**
   * API timeout
   */
  timeout?: number
}

export type GeneralResponseBody = {
  /**
   * Return code
   */
  returnCode: string
  /**
   * Return message
   * Return message or reason for failure. The following are examples.
   * - Unpayable merchant
   * - Merchant authentication information error
   */
  returnMessage: string
}

export type HttpConfig<Params = Record<string, string>> = {
  /**
   * HTTP request headers
   */
  headers?: Record<string, string>
  /**
   * HTTP query parameters
   */
  params?: Params
  /**
   * HTTP request timeout
   */
  timeout?: number
}

export interface HttpClient {
  /**
   * Send a HTTP GET request
   */
  get: <P, R>(url: string, config: HttpConfig<P>) => Promise<HttpResponse<R>>
  /**
   * Send a HTTP POST request
   */
  post: <T, R>(
    url: string,
    body: T,
    config?: HttpConfig
  ) => Promise<HttpResponse<R>>
}

export type Recipient = {
  /**
   * Recipient name
   */
  firstName?: string
  /**
   * Recipient last name
   */
  lastName?: string
  /**
   * Additional information of the recipient first name
   */
  firstNameOptional?: string
  /**
   * Additional information of the recipient last name
   */
  lastNameOptional?: string
  /**
   * Email of the recipient
   */
  email?: string
  /**
   * Phone number of the recipient
   */
  phoneNo?: string
}

export type Address = {
  /**
   * Shipping country
   */
  country?: string
  /**
   * Shipping postal code
   */
  postalCode?: string
  /**
   * Shipping region
   */
  state?: string
  /**
   * Shipping address
   */
  city?: string
  /**
   * Shipping detail
   */
  detail?: string
  /**
   * Additional information of the shipping address
   */
  optional?: string
  /**
   * Recipient of the shipping address
   */
  recipient?: Recipient
}

export type Product = {
  /**
   * ID of sales products of the merchant
   */
  id?: string
  /**
   * Name of the sales products
   */
  name: string
  /**
   * Image URL of the sales products
   */
  imageUrl?: string
  /**
   * 	Number of products
   */
  quantity: number
  /**
   * Price of each product
   */
  price: number
  /**
   * Original price of each product
   */
  originalPrice?: number
}

/**
 * Payment currency (ISO 4217)
 */
export type Currency = 'USD' | 'JPY' | 'TWD' | 'THB'
