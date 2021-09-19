export const getSampleIndexDetails = () => {
  return {
    attributeTypeLookup: {
      _created_at: "DATE_VALUE",
      _file_type: "STRING_VALUE"
    },
    index: {
      DocumentMetadataConfigurations: [
        {
          Name: "_created_at",
          Type: "DATE_VALUE",
          Search: {
            Facetable: true,
            Searchable: true,
            Displayable: true,
          },
        },
        {
          Name: "_file_type",
          Type: "STRING_VALUE",
          Search: {
            Facetable: true,
            Searchable: true,
            Displayable: true,
          },
        }
      ],
      Id: "mock-index-id",
      Status: "ACTIVE",
    },
  };
};
