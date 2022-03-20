import {
  BrowserRouter as Router,
  Switch,
  Route,
  NavLink,
} from "react-router-dom";
import { Navbar, Nav, Container, Alert, Button } from "react-bootstrap";
import Home from "./routes/Home";
import Search from "./routes/Search";
import Dashboard from "./routes/Dashboard/index";
import { useState } from "react";
import { payloadFromToken, logOut } from "./api/auth";

const routes = [
  { path: "/search", name: "Search", Component: Search },
  {
    path: "/dashboard/:key*",
    name: "Dashboard",
    Component: Dashboard,
    hide: true,
  },
  { path: "/", name: "Home", Component: Home },
];

function Navigation({ userName }) {
  return (
    <Navbar bg="dark" variant="dark">
      <Container>
        <Navbar.Brand>Amazon Transcribe PCA</Navbar.Brand>
        <Navbar.Toggle aria-controls="navbar-nav" />
        <Navbar.Collapse id="navbar-nav">
          <Nav className="me-auto">
            {routes
              .filter((r) => !r.hide)
              .reverse()
              .map((route) => (
                <Nav.Link
                  key={route.path}
                  as={NavLink}
                  to={route.path}
                  activeClassName="active"
                  exact
                >
                  {route.name}
                </Nav.Link>
              ))}
          </Nav>
          <Navbar.Text>Signed in as: {userName}</Navbar.Text>
          <Navbar.Text className="justify-content-end ">
            <Button className="pe-0" variant="dark" onClick={logOut}>
              Logout
            </Button>
          </Navbar.Text>
        </Navbar.Collapse>
      </Container>
    </Navbar>
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

  return (
    <Router>
      <>
        <Navigation userName={cognitoUserName} />
        {alert && (
          <Alert variant={alert.variant} dismissible onClose={onDismiss}>
            <Container className="py-3 ps-4">
              <Alert.Heading>{alert.heading}</Alert.Heading>
              {alert.text}
            </Container>
          </Alert>
        )}
        <Container className="py-3">
          <Switch>
            {routes.map(({ path, Component }) => (
              <Route key={path} path={path}>
                <div className="page">
                  <Component setAlert={setAlert} />
                </div>
              </Route>
            ))}
          </Switch>
        </Container>
      </>
    </Router>
  );
}

export default App;
