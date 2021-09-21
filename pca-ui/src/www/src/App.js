import {
  BrowserRouter as Router,
  Switch,
  Route,
  NavLink
} from "react-router-dom";
import { Navbar, Nav, Container } from "react-bootstrap";
import Home from "./routes/Home";
import Search from "./routes/Search";
import Dashboard from "./routes/Dashboard";

const routes = [
  { path: '/', name: 'Home', Component: Home },
  { path: '/dashboard', name: 'Dashboard', Component: Dashboard },
  { path: '/search', name: 'Search', Component: Search },
]

function Navigation() {
  return (
    <Navbar bg="light" expand="lg">
      <Container>
        <Navbar.Brand>Amazon Transcribe PCA</Navbar.Brand>
        <Navbar.Toggle aria-controls="navbar-nav" />
        <Navbar.Collapse id="navbar-nav">
          <Nav className="me-auto">
            {routes.map(route => (
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
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}

function App() {
  return (
    <Router>
      <>
        <Navigation/>
        <Container className="py-3">
          <Switch>
            {routes.map(({ path, Component }) => (
              <Route key={path} exact path={path}>
                <div className="page">
                  <Component />
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
