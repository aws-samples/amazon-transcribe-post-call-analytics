import {
  BrowserRouter as Router,
  Switch,
  Route,
  NavLink,
} from "react-router-dom";
import { Navbar, Nav, Container, Alert } from "react-bootstrap";
import Home from "./routes/Home";
import Search from "./routes/Search";
import Dashboard from "./routes/Dashboard/index";
import { useState } from "react";

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

function Navigation({ userId }) {
  return (
    <Navbar bg="light" expand="lg">
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
          <Navbar.Text>
            Signed in as: { userId }
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

  const userToken = localStorage.getItem('id_token');
  let idToken = userToken.split(".");
  let idTokenDecoded = atob(idToken[1]);
  let idTokenJsonArray= JSON.parse(idTokenDecoded);
  const userName = idTokenJsonArray['cognito:username'];

  return (
    <Router>
      <>
        <Navigation
          userId = { userName }
        />
        {alert && (
          <Alert variant={alert.variant} dismissible onDismiss={onDismiss}>
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
