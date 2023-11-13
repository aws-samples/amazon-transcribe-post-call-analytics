import {
  BrowserRouter as Router,
  Switch,
  Route,
  NavLink,
} from "react-router-dom";
// import { Navbar, Nav, Container, Alert, Button } from "react-bootstrap";
import { AppLayout,Alert,Notifications, Header, Link, BreadcrumbGroup, TopNavigation, Container, Button} from "@cloudscape-design/components"
import Home from "./routes/Home";
import Search from "./routes/Search";
import Dashboard from "./routes/Dashboard/index";
import { useState } from "react";
import { payloadFromToken, logOut } from "./api/auth";

const routes = [
  {
    path: "/search",
    name: "Search",
    Component: Search,
    Breadcrumb: () => {
      return <BreadcrumbGroup
        items={[
          { text: "Home", href: "../" },
          { text: "Search", href: "search" }
        ]}
        ariaLabel="Breadcrumbs"
      />
    }
  },
  {
    path: "/dashboard/parsedFiles/search",
    name: "Search",
    Component: Search,
    Breadcrumb: () => {
      return <BreadcrumbGroup
        items={[
          { text: "Home", href: "../" },
          { text: "Search", href: "search" }
        ]}
        ariaLabel="Breadcrumbs"
      />
    }
  },
  {
    path: "/dashboard/:key*",
    name: "Call Details",
    hide: true,
    Component: Dashboard,
    Breadcrumb: () => {
      return <BreadcrumbGroup
        items={[
          { text: "Home", href: "../../" },
          { text: "Call List", href: "../../" },
          { text: "Call Details", href: "#" },
        ]}
        ariaLabel="Breadcrumbs"
      />
    }
  },
  {
    path: "/",
    name: "Call List",
    Component: Home,
    Breadcrumb: () => {
      return <BreadcrumbGroup
        items={[
          { text: "Home", href: "#" },
          { text: "Call List", href: "#" },
        ]}
        ariaLabel="Breadcrumbs"
      />
    }
  },
];

function Navigation({ userName, email }) {
  return (
    <TopNavigation
      identity={{
        href: "/",
        title: "Amazon Transcribe Post-Call Analytics",
        iconName: "settings"
      }}
      i18nStrings={{
        searchIconAriaLabel: "Search",
        searchDismissIconAriaLabel: "Close search",
        overflowMenuTriggerText: "More",
        overflowMenuTitleText: "All",
        overflowMenuBackIconAriaLabel: "Back",
        overflowMenuDismissIconAriaLabel: "Close menu"
      }}
      utilities={[
        {
          type: "button",
          text: "Search",
          iconName: "search",
          href: "search",
          externalIconAriaLabel: " (opens in a new tab)"
        },
        {
          type: "button",
          text: "PCA Blog Post",
          href: "https://amazon.com/post-call-analytics",
          external: true,
          externalIconAriaLabel: " (opens in a new tab)"
        },
        {
          type: "menu-dropdown",
          text: userName,
          description: email,
          iconName: "user-profile",
          onItemClick: (event) => {
            console.log(event);
            if (event.detail.id === "signout") logOut();
          },
          items: [
            /* { id: "profile", text: "Profile" },
            { id: "preferences", text: "Preferences" },
            { id: "security", text: "Security" },*/
            {
              id: "support-group",
              text: "Support",
              items: [
                {
                  id: "documentation",
                  text: "GitHub/Readme",
                  href: "https://github.com/aws-samples/amazon-transcribe-post-call-analytics/",
                  external: true,
                  externalIconAriaLabel:
                    " (opens in new tab)"
                },
                {
                  id: "feedback",
                  text: "Blog Post",
                  href: "https://amazon.com/post-call-analytics",
                  external: true,
                  externalIconAriaLabel:
                    " (opens in new tab)"
                }
              ]
            },
            { id: "signout", text: "Sign out" }
          ]
        }

      ]}
    />
  );
}

function App() {
  const [alert, setAlert] = useState();

  const onDismiss = () => {
    setAlert(null);
  };

  const userToken = localStorage.getItem("id_token");
  const parsedToken = payloadFromToken(userToken);
  const cognitoUserName = parsedToken["cognito:username"] || "Unknown";
  const cognitoEmail = parsedToken["email"] || "Unknown";

  return (
    <Router>
      <Switch>
        {routes.map(({ path, Component, Breadcrumb, name }) => (
          <Route key={path} path={path}>
            <Navigation userName={cognitoUserName} email={cognitoEmail} />
            <AppLayout
              stickyNotifications
              toolsHide
              navigationHide
              breadcrumbs={
                <Breadcrumb/>
              }
              notifications={alert && (
                <Alert
                  variant={alert.variant}
                  dismissible
                  header={alert.heading}
                  onDismiss={onDismiss}
                >
                  {alert.text}
                </Alert>
              )}
              content={
                <Component setAlert={setAlert} />
              }
            />
          </Route>
        ))}
      </Switch>
    </Router>
  );
}

export default App;
