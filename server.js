
var fs = require('fs');
var authInfo = JSON.parse(fs.readFileSync('authInfo.json', 'utf8'));

var request = require('request');

request.get({
     url: authInfo.result.instanceUrl +
     "/services/data/v44.0/query/?q=SELECT+Id+FROM+Knowledge__DataCategorySelection",
     headers: {
         'Authorization': 'OAuth ' + authInfo.result.accessToken
     }
    },
     (err, res) => {
        if(err){
            console.error(err);
         }
        if(res){
            console.log(res.body);
        }
});

