Kendra Search App

The Kendra search app is a set of sample files that developers can use to build a functional search experience - integrated with Amazon Kendra - into their existing React web application.  It contains all of the logic to display Kendra search results just like they are presented in the AWS Console for Amazon Kendra including formatting, separation of result types, pagination, and more.

Customers can choose to copy individual components or the entire search experience and plug them into their web application.  


License Summary

This sample code is made available under a modified MIT license. See the LICENSE file.
The sample data provided in the files exampleData1.ts and exampleData2.ts represent mock responses from the Amazon Kendra query API.  The mock responses consist of data from https://en.wikipedia.org/, mashed up, and formatted to look like an API response from Amazon Kendra.  The sample data provided in the two files is provided under the Creative Commons Attribution-ShareAlike License (https://en.wikipedia.org/wiki/Wikipedia:Text_of_Creative_Commons_Attribution-ShareAlike_3.0_Unported_License), pulled from the following locations:


    * https://en.wikipedia.org/wiki/Portal:Ancient_Rome 
    * https://en.wikipedia.org/wiki/Battle_of_Mount_Algidus 
    * https://en.wikipedia.org/wiki/Battle_of_Arausio 
    * https://en.wikipedia.org/wiki/Cilician_pirates#Rise_of_piracy 
    * https://en.wikipedia.org/wiki/Culture_of_ancient_Rome 

See the THIRDPARTY file.


Outline

Overview
Instructions
Architecture/Code details
Additions, forks, and contributions


Overview

The goal of the Kendra search app is to provide a functional search page experience that customers can use to integrate Amazon Kendra search results into their existing React web application.  Creating a search page experience from scratch can be quite time consuming, and the files included in the search app will help developers get their search experience up and running quickly.

The provided search files and components are structured in the following way:


* Main (search) page
    * Search bar
    * Results section
        * Suggested answers (top results)
        * FAQ results
        * Document results (Recommended documents)
        * Feedback
        * Faceting
    * Pagination

We will dive into these components in more detail in the Architecture section below.


Instructions

Prerequisites/dependencies

* Existing React web application
    * If you don’t have a React web application already, please refer to this guide (https://reactjs.org/docs/create-a-new-react-app.html)for more information on how to create a React web application. Alternatively you can follow steps to set up a new react development environment right below.
* Ensure your development environment has the following frameworks/libraries:
    * React (version 16.8.10)
    * Bootstrap (version: 4.3.1)
    * Typescript (version 3.2.1)
    * @types/lodash
    * aws-sdk
* Steps to set up a new react development environment with all the dependencies:
    * npx create-react-app my-app —typescript 
    * npm install react-bootstrap bootstrap
    * npm install @types/lodash
    * npm install aws-sdk
* You need the AWS SDK set up to make the API calls to Amazon Kendra 
    * If you do not have the AWS SDK set up, please refer to the getting started links below. Depending on your choice of client, please set up the appropriate AWS SDK. Here are a couple of quick links to links to get started with the AWS SDK in Java or JavaScript:
        * Java: https://docs.aws.amazon.com/sdk-for-java/v1/developer-guide/setup-install.html
        * JavaScript: https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/welcome.html
    * We have also provided a solution using credentials locally setup aws sdk. Please remember that this should only be used for local development, do not publish your credentials to any public repositories.

Steps

* If you are new to react and want to get the pre-setup-react-app for kendra samples you can download the kendrasamples-react-app.zip. Unpack the file and run npm install && npm run start. If you have an existing app then follow the steps under.
* Once you finish setting up your development environment, download the source files from this repository and move them into your main source directory. 
    * The easiest method is to add the entire folder titled “search” to your source.
* To setup aws-sdk using local-credentials add the entire folder titled "services" in your main directory.
    * Copy /src/services/local-dev-credentials-template.json to /src/services/local-dev-credentials.json and fill in your authentication details. Remember to not add this file to any public repository. If you use git, add it to .gitignore file.
    * Remember, do *not* use this in production.
    * You can refer to App.tsx to see how to add the sdk to the Search component.
* Choose an existing page or create a new page for search.
    * Alternatively, you can add the search experience to an existing page. To do this, you will render the Search.tsx component (mentioned below in Architecture) inside of the existing page.
* Add the search.tsx component to the page.
* Build the changes into your package and go to the search page on your localhost.
* You will see a search input box. Enter some text into the input box - for example, “Rome” - and press enter.  
    * For the purposes of this sample application, we have pre-populated the application with sample data about Rome. See “Sample data” in the Architecture section below for more info.
* You will see the search results populated on the page. 
* More information on each of the search result components is provided in the Architecture section below.
* Note: The results you see are from sample data provided for demonstration purposes . To use the search application with your Indexes and Data sources configured in Amazon Kendra, finish setting up the AWS SDK and integrate the API.

Architecture/Code details

As mentioned in the Overview section, the provided search files and supporting components create the search experience provided in this sample search app.  In this section, we will explore the components in more detail.


*Main (search) page - Search.tsx*

* File path: search/Search.tsx
* This is the main file that contains all the components on the search page, including:
    * Search bar input
    * Results section
        * Top results
        * FAQ results
        * Document results
        * Feedback
        * Faceting
    * Pagination
* This file is the single place where you will integrate the API call to Amazon Kendra (either directly or through your web server, integrated with the AWS SDK).  Please look at the documentation for the Kendra query API to learn about the required parameters.
* Note: As provided, this file calls an included function that returns sample data.  You will replace this call with the actual API call or reference through your web server.



*Search bar - Searchbar.tsx*

* File path: search/searchBar/Searchbar.tsx
* This is the component that goes on the top of the page, and contains the UI for the input search box.
* The function “onSearch” is a hook to the main function in Search.tsx to make the API call. It picks up the text entered in the search box.



*Results Section - resultspanel.tsx*

* File path: search/resultsPanel/resultsPanel.tsx
* This larger section is used to display the results returned by the query API, separated into three different result elements.
* Each of these result elements utilizes a set of shared components for features like highlighting, titles, links, feedback buttons, etc. The shared components are located in the path “search/resultsPanel/components.” The shared components must be present for each of the result elements to work.
    * Make sure to add the api integration to submit feedback in Feedback.tsx file.
* The first result element is suggested answers 
    * Categorized as “ANSWER” in the API response
    * File path: search/resultsPanel/topResults.tsx
    * This element sits at the top of the results section and provides up to three suggested answers from Amazon Kendra.
* The second result element is frequently asked questions 
    * Categorized as "QUESTION_ANSWER" in the API response
    * File path: search/resultsPanel/faqResults.tsx
    * This element sits in the middle of the results section and provides as many FAQ answers as it finds that are relevant to the search query.
* The third result element is recommended documents
    * Categorized as "DOCUMENT" in the API response
    * File path: search/resultsPanel/documentResults.tsx
    * This element sits towards the bottom of the results section and provides additional results based on indexed documents.
* Kendra allows users to provide feedback to improve the performance of the service. The two different types of feedback collected are Click Feedback and Relevance Feedback.
    * Click Feedback: ClickFeedback is submitted when a user selects a document link. The function submitClickFeedback in “search/resultsPanel/components/ResultTitle.tsx” is the hook to the main function in Search.tsx to make the API call to Kendra.
    * Relevance Feedback: Users can mark a result as relevant or non relevant and submit feedback to Kendra to improve the performance. This is recorded using the thumbs up and thumbs down icon in each result. The function submitFeedback in “search/resultsPanel/components/Feedback.tsx” is the hook to the main function in Search.tsx to make the API call to Kendra.

*Faceting - Facets.tsx*

* File path: search/facets/Facets.tsx
* This is the component that goes to the left of the search results. This contains the UI to display the available facets and their values to filter on.
* The files search/facets/AvailableFacetManager.ts and search/facets/SelectedFacetManager.ts contain helpers to manage the faceting state and build the resulting filter. 
* The function "onSelectedFacetsChanged" is a hook to the main function in Search.tsx to make the query API call with the updated filter.

*Pagination controls - pagination.tsx*

* File path: search/pagination/Pagination.tsx
* This is the component that goes at the bottom of the page below all of the search results.  This contains the UI to display page numbers and pagination controls.
* The function “onPageSelected” is a hook to the main function in Search.tsx to make the query API call. This sets the correct page number and passes it to the main function.



*Images and utility files*

* There are additional shared components referenced by the above search components and sub-elements.  These shared components must be present for the search experience to work.
* File paths: 
    * /search/constants.ts
    * /search/images
    * /search/search.css
    * /search/utils.ts

*Configuration file*

* This configuration file enables you to customize how facets are displayed. You can configure the number of facets to show, the number of facets you can select, whether to show the facet panel by default, and more.
* File path:
    * /search/configuration.ts


*Sample data*

* There are two dataset files (exampleData1.ts and exampleData2.ts) included in the application that contain sample data to help visualize the search result experience before hooking up to the Amazon Kendra APIs.  They are not essential to the function of the search app files, and are provided only for demonstration purposes.
* File paths: 
    * /search/exampleData/exampleData1.ts
    * /search/exampleData/exampleData2.ts
* Attribution: the sample data provided in these two files is provided under the Creative Commons Attribution-ShareAlike License (https://en.wikipedia.org/wiki/Wikipedia:Text_of_Creative_Commons_Attribution-ShareAlike_3.0_Unported_License), pulled from the following locations:
    * https://en.wikipedia.org/wiki/Portal:Ancient_Rome 
    * https://en.wikipedia.org/wiki/Battle_of_Mount_Algidus 
    * https://en.wikipedia.org/wiki/Battle_of_Arausio 
    * https://en.wikipedia.org/wiki/Cilician_pirates#Rise_of_piracy 
    * https://en.wikipedia.org/wiki/Culture_of_ancient_Rome 

Security issue notifications

If you discover a potential security issue in this project we ask that you notify AWS/Amazon Security via our vulnerability reporting page (http://aws.amazon.com/security/vulnerability-reporting/). 
