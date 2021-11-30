export type QueryParams = Record<string, string | number | boolean>

export type Currency = 'USD' | 'JPY' | 'TWD' | 'THB'

export type LineMerchantConfig = {
  channelId: string
  channelSecretKey: string
  env: 'development' | 'production'
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
