
var fs = require('fs');
var request = require('request-promise-native');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var http = require('http').Server(app);
var apiVersion = "v44.0";

var authInfo = JSON.parse(fs.readFileSync('authInfo.json', 'utf8'));

app.use(express.static(__dirname));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

var server = http.listen(3000, () => {
    console.log('Server is listening on port', server.address().port)
});

app.get('/categories', async (req, res) => {
    try {
        let options = {
            url: authInfo.result.instanceUrl +
            "/services/data/" + apiVersion + "/support/dataCategoryGroups?sObjectName=KnowledgeArticleVersion&topCategoriesOnly=false",
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            }
        };
        let sfCategories = await request.get(options);
        res.send(JSON.parse(sfCategories));
    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }
});

app.get('/record-types', async (req, res) => {
    try {
        let options = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + "/query/?q=SELECT+Id,Name,SobjectType+FROM+RecordType+WHERE+IsActive=true+AND+SobjectType='Knowledge__kav'",
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            }
        };

        let sfRecordTypes = await request.get(options);
        res.send(JSON.parse(sfRecordTypes));
    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }
});

app.get('/metadata/:articleId', async (req, res) => {
    try {
        let articleId = req.params.articleId;

        let getArticleMetadataOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/query/?q=SELECT+Id,IsVisibleInApp,IsVisibleInPkb,IsVisibleInCsp,IsVisibleInPrm,RecordTypeId+FROM+Knowledge__kav+WHERE+Id='${articleId}'`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            }
        };
        let sfArticleMetadata = await request.get(getArticleMetadataOptions);

        let getArticleCategoriesMetadataOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/query/?q=SELECT+Id,ParentId,DataCategoryGroupName,DataCategoryName+FROM+Knowledge__DataCategorySelection+WHERE+ParentId='${articleId}'`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            }
        };
        let sfArticleCategoriesMetadata = await request.get(getArticleCategoriesMetadataOptions);

        res.send({metadata: JSON.parse(sfArticleMetadata), categoriesMetadata: JSON.parse(sfArticleCategoriesMetadata)});
    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }
});

