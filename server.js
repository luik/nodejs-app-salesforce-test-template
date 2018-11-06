
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
        let sfCategories = await request(options);
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

        let sfRecordTypes = await request(options);
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
        let sfArticleMetadata = await request(getArticleMetadataOptions);

        let getArticleCategoriesMetadataOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/query/?q=SELECT+Id,ParentId,DataCategoryGroupName,DataCategoryName+FROM+Knowledge__DataCategorySelection+WHERE+ParentId='${articleId}'`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            }
        };
        let sfArticleCategoriesMetadata = await request( getArticleCategoriesMetadataOptions );

        res.send({metadata: JSON.parse(sfArticleMetadata), categoriesMetadata: JSON.parse(sfArticleCategoriesMetadata)});
    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }
});

app.post('/metadata/:articleId', async (req, res) => {
    try {
        let requestBody = req.body;
        let articleId = req.params.articleId;

        let updateArticleMetadataOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/sobjects/Knowledge__kav/${articleId}`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            },
            method: 'PATCH',
            json: true,
            body: {
                IsVisibleInPkb: requestBody.IsVisibleInPkb,
                IsVisibleInCsp: requestBody.IsVisibleInCsp,
                IsVisibleInPrm: requestBody.IsVisibleInPrm,
                RecordTypeId: requestBody.RecordTypeId
            }
        };

        let updateResult = await request( updateArticleMetadataOptions );

        let getArticleCategoriesMetadataOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/query/?q=SELECT+Id,ParentId,DataCategoryGroupName,DataCategoryName+FROM+Knowledge__DataCategorySelection+WHERE+ParentId='${articleId}'`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            }
        };
        let sfArticleCategoriesMetadata = await request( getArticleCategoriesMetadataOptions );

        let categoriesToAdd = [];
        let categoriesToDelete = [];
        let categories = [];

        let requestCategories = requestBody['Categories[]'];
        if(typeof requestCategories === 'string'){
            requestCategories = [requestCategories];
        }

        console.log('Request Categories ', requestCategories);

        JSON.parse(sfArticleCategoriesMetadata).records.forEach(
            articleCategoryMetadata => {
                categories.push(articleCategoryMetadata.DataCategoryName);

                if(requestCategories.indexOf( articleCategoryMetadata.DataCategoryName ) < 0 &&
                    requestBody.CategoryGroup === articleCategoryMetadata.DataCategoryGroupName
                ){
                    categoriesToDelete.push(articleCategoryMetadata);
                }
            }
        );

        requestCategories.forEach(requestCategoryName => {
           if(categories.indexOf(requestCategoryName) < 0){
               categoriesToAdd.push({
                   attributes: {
                       type: 'Knowledge__DataCategorySelection'
                   },
                   ParentId: articleId,
                   DataCategoryGroupName: requestBody.CategoryGroup,
                   DataCategoryName: requestCategoryName
               });
           }
        });

        console.log('To Add: ', categoriesToAdd);
        console.log('To Remove', categoriesToDelete);

        let deleteResult = {};
        let createResult = {};

        if(categoriesToDelete.length > 0){
            let deleteOptions = {
                url: authInfo.result.instanceUrl +
                    "/services/data/" + apiVersion + '/composite/sobjects?ids=' +
                    categoriesToDelete.map(categoryToDelete => categoryToDelete.Id).join(',') ,
                headers: {
                    'Authorization': 'OAuth ' + authInfo.result.accessToken
                },
                method: 'DELETE'
            };
            deleteResult = await request(deleteOptions);
        }
        if(categoriesToAdd.length > 0){
            let createOptions = {
                url: authInfo.result.instanceUrl +
                    "/services/data/" + apiVersion + '/composite/sobjects',
                headers: {
                    'Authorization': 'OAuth ' + authInfo.result.accessToken
                },
                method: 'POST',
                json: true,
                body: {
                    allOrNone: false,
                    records: categoriesToAdd
                }
            };
            createResult = await request(createOptions);
        }

        res.send({
            updateResult: updateResult,
            deleteResult: deleteResult,
            createResult: createResult
        });
    } catch (error){
        res.sendStatus(500);
        console.error(error);
    }

});