import crypto from 'crypto'

/**This function is used to sign the parameters of the weatherlink API request, it takes as parameters the parameters of the request, the API key and the API secret.
* - Keep in mind that parameters that are located in the path of the request still need to be added to the parameters object.*/
export function signParam(parameters, API_KEY, API_SECRET) {
   /* We define the parameters of the API api-key, t are mandatory for all requests so we add them
       - api-key: API key
       - t: timestamp of the request
   */


   if (parameters === undefined || parameters === null) {
       parameters = {};
   }


   var parameterNames = ["api-key", "t"];
   for (var parameterName in parameters) {
       parameterNames.push(parameterName);
   }


   /* 
   The API requires that the parameters be sorted alphabetically
   */
   parameterNames.sort();


   parameters["api-key"] = API_KEY;
   parameters["t"] = Math.floor(Date.now() / 1000);


   /*
   Iteration over the sorted parameters and concatenation of the names and values ​​of the parameters in a single string.
   */
   var data = "";
   for (var parameterName of parameterNames) {
       data = data + parameterName + parameters[parameterName];
   }


   /*
   Calculate the HMAC SHA-256 hash that will be used as the API Signature.
   */
   var hmac = crypto.createHmac("sha256", API_SECRET);
   hmac.update(data);
   parameters['api-signature'] = hmac.digest("hex");
   return parameters;
}
