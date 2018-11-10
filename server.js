
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
                "/services/data/" + apiVersion +
                `/query/?q=SELECT+Id,IsVisibleInApp,IsVisibleInPkb,IsVisibleInCsp,IsVisibleInPrm
                ,RecordTypeId,KnowledgeArticleId
                +FROM+Knowledge__kav+WHERE+Id='${articleId}'`,
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
        let channels = requestBody.channels;

        let updateArticleMetadataOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/sobjects/Knowledge__kav/${articleId}`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            },
            method: 'PATCH',
            json: true,
            body: {
                IsVisibleInPkb: channels.indexOf("IsVisibleInPkb") >= 0,
                IsVisibleInCsp: channels.indexOf("IsVisibleInCsp") >= 0,
                IsVisibleInPrm: channels.indexOf("IsVisibleInPrm") >= 0,
                RecordTypeId: requestBody.recordType.id
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

        let requestCategories = requestBody.categories;

        console.log('Request Categories ', requestCategories);

        JSON.parse(sfArticleCategoriesMetadata).records.forEach(
            articleCategoryMetadata => {
                categories.push(articleCategoryMetadata);

                if(requestCategories.map(function(category){return category.categoryGroup + ':' + category.category; })
                        .indexOf( articleCategoryMetadata.DataCategoryGroupName + ':' + articleCategoryMetadata.DataCategoryName ) < 0
                ){
                    categoriesToDelete.push(articleCategoryMetadata);
                }
            }
        );

        requestCategories.forEach(requestCategory => {
           if( categories.map(function(category){return category.DataCategoryGroupName + ':' + category.DataCategoryName; })
               .indexOf(requestCategory.categoryGroup + ':' + requestCategory.category ) < 0){
               categoriesToAdd.push({
                   attributes: {
                       type: 'Knowledge__DataCategorySelection'
                   },
                   ParentId: articleId,
                   DataCategoryGroupName: requestCategory.categoryGroup,
                   DataCategoryName: requestCategory.category
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

app.get('/draft/:articleVersionId', async (req, res) => {
    try {
        let response = {};
        let articleVersionId = req.params.articleVersionId;
        console.log( 'articleVersionId', articleVersionId );

        let getArticleVersionOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + "/query/?q=SELECT+Id,KnowledgeArticleId,PublishStatus,IsLatestVersion,VersionNumber" +
                `+FROM+Knowledge__kav+WHERE+Id='${articleVersionId}'`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            },
            json: true,
        };

        response.articleVersion = await request(getArticleVersionOptions);
        let articleId =  response.articleVersion.records[0].KnowledgeArticleId;

        console.log( 'knowledgeArticleId', articleId );

        ////Getting Article data
        let getArticleOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/knowledgeManagement/articles/${articleId}`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            },
            json: true,
        };

        response.article = await request(getArticleOptions);

        let draftVersionId = response.article.draftArticleMasterVersionId;

        if( draftVersionId === ""){
            let getDraftOptions = {
                url: authInfo.result.instanceUrl +
                    "/services/data/" + apiVersion + "/knowledgeManagement/articleVersions/masterVersions",
                headers: {
                    'Authorization': 'OAuth ' + authInfo.result.accessToken
                },
                method: 'POST',
                json: true,
                body: {
                    articleId: articleId
                }
            };
            response.createdDraft = await request(getDraftOptions);
            draftVersionId = response.createdDraft.id;
        }

        console.log('Draft Version Id', draftVersionId);
        res.send( response );

        //// History entries always returns 0
        // let getLastHistoryEntryOptions = {
        //     url: authInfo.result.instanceUrl +
        //         "/services/data/" + apiVersion + "/query/?q=SELECT+Id,VersionNumber,VersionId" +
        //         `+FROM+KnowledgeArticleVersionHistory` +
        //         "+AND+IsDeleted=false+ORDER+BY+VersionNumber+DESC+LIMIT+1"
        //     ,
        //     headers: {
        //         'Authorization': 'OAuth ' + authInfo.result.accessToken
        //     }
        // };
        // let lastHistoryEntryResponse = await request(getLastHistoryEntryOptions);
        // console.log('lastHistoryEntryResponse', lastHistoryEntryResponse);
        // res.send(lastHistoryEntryResponse);

        ////
        // let getLastArticleVersionOptions = {
        //     url: authInfo.result.instanceUrl +
        //         "/services/data/" + apiVersion + "/query/?q=SELECT+Id,KnowledgeArticleId,PublishStatus,IsLatestVersion,VersionNumber" +
        //         `+FROM+Knowledge__kav+WHERE+KnowledgeArticleId='${articleId}'`+
        //         "+AND+PublishStatus='Online'+AND+IsDeleted=false+ORDER+BY+VersionNumber+DESC+LIMIT+1"
        //     ,
        //     headers: {
        //         'Authorization': 'OAuth ' + authInfo.result.accessToken
        //     }
        // };
        // let lastArticleVersionResponse = await request(getLastArticleVersionOptions);
        // res.send( JSON.parse(lastArticleVersionResponse) );


    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }
});

app.get('/describe/:sObject', async (req, res) => {
    try {
        let sObject = req.params.sObject;

        let getSObject = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/sobjects/${sObject}/describe`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            },
            json: true
        };
        let sObjectResponse = await request(getSObject);
        res.send( sObjectResponse );
    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }
});

app.get('/sobjects/:articleId', async (req, res) => {
    try{
        let articleId = req.params.articleId;

        let getArticleKavOptions = {
            url: authInfo.result.instanceUrl +
                "/services/data/" + apiVersion + `/sobjects/Knowledge__kav/${articleId}`,
            headers: {
                'Authorization': 'OAuth ' + authInfo.result.accessToken
            },
            json: true
        };

        let articleKavResult = await request( getArticleKavOptions );
        res.send(articleKavResult);
    } catch (error) {
        res.sendStatus(500);
        console.error(error);
    }

});