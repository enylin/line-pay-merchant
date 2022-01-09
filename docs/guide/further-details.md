# Further Details

## TypeScript Support

This library is written in TypeScript. Users can get type definitions without installing additional libraries.

## Transaction ID

JavaScript numbers are double-precision floating-point numbers.
LINE Pay Transaction ID is a number larger than the largest integer JavaScript can be precisely stored (which is 2^53, 9007199254740992).
This may cause the transaction ID received from LINE Pay APIs to be recognized incorrectly. For example, the transaction ID number 2021121300698360310 may be converted to 2021121300698360300 by default parser.
This library handles the behavior by converting the transaction ID number to string format before the default parser (`JSON.parse`) parses the response received from LINE Pay APIs.
