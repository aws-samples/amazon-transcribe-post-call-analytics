// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import React from "react";
import Search from "./search/Search";
import { facetConfiguration } from "./search/configuration";
import S3 from 'aws-sdk/clients/s3';
import AWS from 'aws-sdk';
import aws_exports from './aws-exports';
import Kendra from 'aws-sdk/clients/kendra';
import Auth from '@aws-amplify/auth';
import { AuthState, UI_AUTH_CHANNEL, AUTH_STATE_CHANGE_EVENT } from '@aws-amplify/ui-components';
import { AmplifyGreetings, AmplifySignIn, AmplifyAuthenticator } from '@aws-amplify/ui-react';
import { Hub } from "@aws-amplify/core";
import Button from 'react-bootstrap/Button';
import searchlogo from './searchConsoleArt.svg'

import "./App.css";

const indexId = process.env.REACT_APP_INDEX_ID!;
const region = process.env.REACT_APP_REGION!;
const role_arn = process.env.REACT_APP_ROLE_ARN!;
const enable_auth = process.env.REACT_APP_ENABLE_AUTH!;
const enable_guest = process.env.REACT_APP_ENABLE_GUEST!;
const enable_tokens = process.env.REACT_APP_ENABLE_ACCESSTOKENS!;

interface AppState {
  infraReady: boolean;
  loginScreen: boolean;
  authUser: boolean;
  kendra?: Kendra;
  s3?: S3;
  user?: string;
  accessToken?: string;
}

class App extends React.Component<string[], AppState> {
  constructor(props: string[]) {
    super(props);
    this.state = {
      infraReady: false,
      loginScreen: true,
      authUser: true,
      kendra: undefined,
      s3: undefined,
      user: undefined,
      accessToken: undefined
    };
  }
  
  handleClick = async () => {
    this.setState({authUser: !this.state.authUser});
  }
  
  authChangeState = async (nextAuthState: AuthState) => {
    try {
      let user = await Auth.currentAuthenticatedUser();
      //accessToken contains all the information about username, groupname etc.
      let accessToken = user.signInUserSession.accessToken.jwtToken;
      if (nextAuthState === AuthState.SignedIn){
        this.setState({loginScreen:false, authUser: true, user: user ? user!.username : undefined, accessToken: accessToken ? accessToken : undefined});
      } else if (nextAuthState === AuthState.VerifyContact){
        Hub.dispatch(UI_AUTH_CHANNEL, {
          event: AUTH_STATE_CHANGE_EVENT,
          message: AuthState.SignedIn,
          data: await Auth.currentAuthenticatedUser(),
        }); 
        this.setState({loginScreen:true, authUser: true, user: user ? user!.username : undefined, accessToken: accessToken ? accessToken : undefined});
      } else {
        this.setState({loginScreen:true, authUser: true, user: user ? user!.username : undefined, accessToken: accessToken ? accessToken : undefined});
      }
    } catch {
      console.log('currentAuthenticatedUser Exception');
      if (nextAuthState === AuthState.SignedIn){
        this.setState({loginScreen:false, authUser: true, user: undefined, accessToken: undefined});
      } else if (nextAuthState === AuthState.VerifyContact){
        Hub.dispatch(UI_AUTH_CHANNEL, {
          event: AUTH_STATE_CHANGE_EVENT,
          message: AuthState.SignedIn,
          data: await Auth.currentAuthenticatedUser(),
        }); 
        this.setState({loginScreen:true, authUser: true, user: undefined, accessToken: undefined});
      } else {
        this.setState({loginScreen:true, authUser: true, user: undefined, accessToken: undefined});
      }
    }
  }
 
  setInfra(accessKeyId:string, secretAccessKey:string, sessionToken:string) {
    let sts = new AWS.STS({
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      sessionToken: sessionToken,
      region: region
    });
    let sts_params = {
      RoleArn: role_arn,
      RoleSessionName:"wapp"+ Date.now(),
      DurationSeconds:3600
    };
    //Make a call to assume the role to access Kendra and corresponding S3 objects
    sts.assumeRole(sts_params, (err, data) => {
      if (err) console.log("sts_assumerole Error:", err);
      else {
        let kendra = new Kendra({
          accessKeyId: data.Credentials!.AccessKeyId,
          secretAccessKey: data.Credentials!.SecretAccessKey,
          sessionToken: data.Credentials!.SessionToken,
          region: region
        }); 
        //S3 is required to get signed URLs for S3 objects
        let s3 = new S3({
          accessKeyId: data.Credentials!.AccessKeyId,
          secretAccessKey: data.Credentials!.SecretAccessKey,
          sessionToken: data.Credentials!.SessionToken,
          region: region
        }); 
        //Call setState to enforce render being called again
        this.setState({
          infraReady: true, 
          kendra: kendra,
          s3: s3
        });
      }
    });
  }
  
  async componentDidMount() {
    Auth.configure(aws_exports);
    try {
      let credentials = await Auth.currentUserCredentials();
      //Use Cognito Credentials either authorized or unauthorized to get temporary credentials for Kendra
      this.setInfra(credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken);
    } catch (e) {
      console.log("Auth exception: ", e);
    }
  }
  
  render() {
        return (
          <div className="App">
            {this.state.authUser && (enable_auth === 'true') && (
              <div style={{textAlign: 'left'}}>
              {this.state.loginScreen && (enable_guest === 'true') && (
                <div style={{display: 'flex', justifyContent: 'center'}}>
                  <Button as="input" type="submit" value="Continue as Guest" onClick={this.handleClick} block/>
                </div>
              )}
                <div style={this.state.user ? {} : {display: 'flex', justifyContent: 'center'}}>
                  <AmplifyAuthenticator handleAuthStateChange={this.authChangeState}>
                    <AmplifySignIn slot="sign-in" hideSignUp />
                    <AmplifyGreetings username={this.state.user} slot="greetings"/>
                    {this.state.user && this.state.infraReady && this.state.s3 && (enable_tokens === 'true') &&
                      <Search kendra={this.state.kendra} indexId={indexId} s3={this.state.s3} accessToken={this.state.accessToken} facetConfiguration={facetConfiguration}/>
                    }
                    {this.state.user && this.state.infraReady && this.state.s3 && (enable_tokens === 'false') &&
                      <Search kendra={this.state.kendra} indexId={indexId} s3={this.state.s3} facetConfiguration={facetConfiguration}/>
                    }
                  </AmplifyAuthenticator>
                </div>
              </div>
            )}
            {!this.state.authUser && this.state.infraReady && this.state.s3 && ( 
            <div>
              {this.state.loginScreen && (enable_guest === 'true') && (
                <div style={{display: 'flex', justifyContent: 'center'}}>
                  <Button as="input" type="submit" value="Welcome Guest! Click here to sign up or sign in" onClick={this.handleClick} block/>
                </div>
              )}
              <Search kendra={this.state.kendra} indexId={indexId} s3={this.state.s3} facetConfiguration={facetConfiguration}/>
            </div>
            )}
            {(enable_auth === 'false') &&  (
              <div className="App">
                <div style={{textAlign: 'center'}}>
                  <img src={searchlogo} alt='Search Logo' />
                </div>
                <Search kendra={this.state.kendra} indexId={indexId} s3={this.state.s3} facetConfiguration={facetConfiguration}/>
             </div>
            )}
          </div>
        );      
  }
}

export default App;