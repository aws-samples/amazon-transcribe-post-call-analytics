import React from "react";
import {
  Form,
  FormControl,
  Button,
  FormControlProps,
  InputGroup,
  Image
} from "react-bootstrap";

import searchImage from "../images/search-image.svg";
import "../search.scss";

interface SearchBarProps {
  onSubmit: (queryText: string, pageNumber: number) => void;
}

interface SearchBarState {
  queryText: string;
}

export default class SearchBar extends React.Component<
  SearchBarProps,
  SearchBarState
> {
  constructor(props: SearchBarProps) {
    super(props);

    this.state = {
      queryText: ""
    };
  }

  /*
   If you run into typing issues for the event type, trying switching the on change line with this
   onChange = (event: React.FormEvent<FormControlProps>) => {
  */
  onChange = (
    event: React.ChangeEvent<FormControlProps & HTMLInputElement>
  ) => {
    const target = event.target as HTMLInputElement;
    this.setState({ ...this.state, [target.name]: target.value });
  };

  onSearch = (
    event:
      | React.FormEvent<HTMLFormElement>
      | React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    // callback to the API call
    const { onSubmit } = this.props;
    onSubmit(this.state.queryText, 1);
  };

  onButtonSearch = () => {
    const { onSubmit } = this.props;
    onSubmit(this.state.queryText, 1);
  };

  showSearchForm = () => {
    const { queryText } = this.state;
    return (
      <Form
        noValidate
        onSubmit={(event: React.FormEvent<HTMLFormElement>) =>
          this.onSearch(event)
        }
      >
        <InputGroup className="search-bar">
          <FormControl
            placeholder="Enter a query here"
            name="queryText"
            type="queryText"
            onChange={this.onChange}
            value={queryText}
            required
          />
          <InputGroup.Append>
            <Button
              variant="outline-secondary"
              className="search-button"
              onClick={(event: React.MouseEvent<HTMLButtonElement>) =>
                this.onSearch(event)
              }
            >
              <Image src={searchImage} rounded />
            </Button>
          </InputGroup.Append>
        </InputGroup>
      </Form>
    );
  };

  render() {
    return <div>{this.showSearchForm()}</div>;
  }
}
