/**
 The sample data provided in the files exampleData1.ts and exampleData2.ts represent 
 mock responses from the Amazon Kendra query API.  The mock responses consist of data 
 from https://en.wikipedia.org/, mashed up, and formatted to look like an API response 
 from Amazon Kendra.  The sample data provided in the two files is provided under the 
 Creative Commons Attribution-ShareAlike License (https://en.wikipedia.org/wiki/Wikipedia:Text_of_Creative_Commons_Attribution-ShareAlike_3.0_Unported_License), 
 pulled from the following locations:
    * https://en.wikipedia.org/wiki/Portal:Ancient_Rome 
    * https://en.wikipedia.org/wiki/Battle_of_Mount_Algidus 
    * https://en.wikipedia.org/wiki/Battle_of_Arausio 
    * https://en.wikipedia.org/wiki/Cilician_pirates#Rise_of_piracy 
    * https://en.wikipedia.org/wiki/Culture_of_ancient_Rome 
See the THIRDPARTY file for more info. 
 */

export const exampleFilterData1 = {
  FacetResults: [
    {
      DocumentAttributeKey: "_file_type",
      DocumentAttributeValueCountPairs: [
        {
          DocumentAttributeValue: {
            StringValue: "PDF",
          },
          Count: 463
        }
      ],
    },
    {
      DocumentAttributeKey: "_created_at",
      DocumentAttributeValueCountPairs: [
        {
          DocumentAttributeValue: {
            StringValue: "2020-03-27T14:33:14.000Z"
          },
          Count: 363
        },
        {
          DocumentAttributeValue: {
            StringValue: "2019-03-27T14:33:14.000Z"
          },
          Count: 100
        }
      ]
    }
  ],
  QueryId: "316827a3-ae5d-4b2d-a436-730243494970",
  ResultItems: [
    {
      AdditionalAttributes: [
        {
          Key: "AnswerText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 0,
                  EndOffset: 4,
                  TopAnswer: false
                },
                {
                  BeginOffset: 92,
                  EndOffset: 96,
                  TopAnswer: false
                },
                {
                  BeginOffset: 143,
                  EndOffset: 147,
                  TopAnswer: false
                }
              ],
              Text:
                "Rome was the only major Mediterranean power left, but at this time her navy was reduced and Rome relied on hiring ships as necessity required. Rome only protected the Tyrrhenian and Adriatic seas, on account of their proximity, with expeditions sent against the pirate bases on the Ligurian and Illyrian coast. The Balearic Isles were cleared in 120 BC for the same purpose.  As a result, the pirates became consolidated and organized. The smaller communities of the Greek and African waters were left to make their own arrangements. Communities unable to fend off the pirate incursions were forced to come to an understanding with the pirates, and thus became havens."
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        }
      ],
      DocumentAttributes: [],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 0,
            EndOffset: 300,
            TopAnswer: false
          }
        ],
        Text:
          "Rome was the only major Mediterranean power left, but at this time her navy was reduced and Rome relied on hiring ships as necessity required. Rome only protected the Tyrrhenian and Adriatic seas, on account of their proximity, with expeditions sent against the pirate bases on the Ligurian and Illyr"
      },
      DocumentId: "",
      DocumentTitle: {
        Text: ""
      },
      DocumentURI: "",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-0d0fd19b-2a6a-4794-baaa-66399c094fce",
      Type: "ANSWER",
      Score: 0.1488952338695526
    },
    {
      AdditionalAttributes: [
        {
          Key: "AnswerText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 0,
                  EndOffset: 4,
                  TopAnswer: false
                },
                {
                  BeginOffset: 92,
                  EndOffset: 96,
                  TopAnswer: false
                },
                {
                  BeginOffset: 143,
                  EndOffset: 147,
                  TopAnswer: false
                }
              ],
              Text:
                "Rome was the only major Mediterranean power left, but at this time her navy was reduced and Rome relied on hiring ships as necessity required. Rome only protected the Tyrrhenian and Adriatic seas, on account of their proximity, with expeditions sent against the pirate bases on the Ligurian and Illyrian coast. The Balearic Isles were cleared in 120 BC for the same purpose.  As a result, the pirates became consolidated and organized. The smaller communities of the Greek and African waters were left to make their own arrangements. Communities unable to fend off the pirate incursions were forced to come to an understanding with the pirates, and thus became havens."
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        }
      ],
      DocumentAttributes: [],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 0,
            EndOffset: 300,
            TopAnswer: false
          }
        ],
        Text:
          "Rome was the only major Mediterranean power left, but at this time her navy was reduced and Rome relied on hiring ships as necessity required. Rome only protected the Tyrrhenian and Adriatic seas, on account of their proximity, with expeditions sent against the pirate bases on the Ligurian and Illyr"
      },
      DocumentId: "",
      DocumentTitle: {
        Text: ""
      },
      DocumentURI: "",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-0d0fd19b-2a6a-4794-baaa-66399c094fce",
      Type: "ANSWER",
      Score: 0.1488952338695526
    },
    {
      AdditionalAttributes: [
        {
          Key: "AnswerText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 16,
                  EndOffset: 20,
                  TopAnswer: false
                },
                {
                  BeginOffset: 49,
                  EndOffset: 53,
                  TopAnswer: false
                },
                {
                  BeginOffset: 316,
                  EndOffset: 320,
                  TopAnswer: false
                },
                {
                  BeginOffset: 437,
                  EndOffset: 441,
                  TopAnswer: false
                }
              ],
              Text:
                "Life in ancient Rome revolved around the city of Rome, its famed seven hills, and its monumental architecture  such  as  the  Colosseum,  Trajan's Forum,  and  the  Pantheon.  The  city  also  had several  theaters,  gymnasia,  and  many  taverns, baths,  and  brothels.  Throughout  the  territory under  ancient  Rome's  control,  residential architecture ranged from very modest houses to country villas, and in the capital city of Rome, there  were  imperial  residences  on  the  elegant Palatine  Hill,  from which  the  word  palace is derived."
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        }
      ],
      DocumentAttributes: [],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 0,
            EndOffset: 300,
            TopAnswer: false
          }
        ],
        Text:
          "Life in ancient Rome revolved around the city of Rome, its famed seven hills, and its monumental architecture  such  as  the  Colosseum,  Trajan's Forum,  and  the  Pantheon.  The  city  also  had several  theaters,  gymnasia,  and  many  taverns, baths,  and  brothels.  Throughout  the  territory "
      },
      DocumentId: "example.pdf",
      DocumentTitle: {
        Text: ""
      },
      DocumentURI: "https://example.pdf",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-607ec852-11f4-43e6-a767-fb03a6acab14",
      Type: "ANSWER",
      Score: 0.30195385217666626
    },
    {
      AdditionalAttributes: [
        {
          Key: "QuestionText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 8,
                  EndOffset: 12,
                  TopAnswer: false
                }
              ],
              Text: "What is Rome?"
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        },
        {
          Key: "AnswerText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 0,
                  EndOffset: 4,
                  TopAnswer: false
                }
              ],
              Text: "Rome is an ancient civilization"
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        }
      ],
      DocumentAttributes: [
        {
          Key: "FileFormat",
          Value: {
            StringValue: "PLAIN_TEXT"
          }
        },
        {
          Key: "Version",
          Value: {
            StringValue: "0"
          }
        },
        {
          Key: "UpdatedAt",
          Value: {
            StringValue: "2019-11-08T20:08:36.334"
          }
        },
        {
          Key: "SourceURI",
          Value: {
            StringValue: ""
          }
        },
        {
          Key: "CreatedAt",
          Value: {
            StringValue: "2019-11-08T20:08:36.334"
          }
        }
      ],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 0,
            EndOffset: 31,
            TopAnswer: false
          }
        ],
        Text: "Rome is an ancient civilization"
      },
      DocumentId:
        "6ebc99f9d36ffd2ce0794e3abcdded3523eb65b1f091bd5d1309aa2d204c5af41573243584751",
      DocumentTitle: {
        Text: ""
      },
      DocumentURI: "",
      Id:
        "316827a3-8726-4b2d-a436-730243494970-de24da9c-32c9-4311-ad96-ae1280229dae",
      Type: "QUESTION_ANSWER",
      Score: 0.5960363745689392
    },
    {
      AdditionalAttributes: [
        {
          Key: "QuestionText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 8,
                  EndOffset: 12,
                  TopAnswer: false
                }
              ],
              Text: "What is Rome 2?"
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        },
        {
          Key: "AnswerText",
          Value: {
            TextWithHighlightsValue: {
              Highlights: [
                {
                  BeginOffset: 0,
                  EndOffset: 4,
                  TopAnswer: false
                }
              ],
              Text: "Rome is an ancient civilization 2"
            }
          },
          ValueType: "TEXT_WITH_HIGHLIGHTS_VALUE"
        }
      ],
      DocumentAttributes: [
        {
          Key: "FileFormat",
          Value: {
            StringValue: "PLAIN_TEXT"
          }
        },
        {
          Key: "Version",
          Value: {
            StringValue: "0"
          }
        },
        {
          Key: "UpdatedAt",
          Value: {
            StringValue: "2019-11-08T20:08:36.334"
          }
        },
        {
          Key: "SourceURI",
          Value: {
            StringValue: ""
          }
        },
        {
          Key: "CreatedAt",
          Value: {
            StringValue: "2019-11-08T20:08:36.334"
          }
        }
      ],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 0,
            EndOffset: 31,
            TopAnswer: false
          }
        ],
        Text: "Rome is an ancient civilization"
      },
      DocumentId:
        "6ebc99f9d36ffd2ce0794e3abcdded3523eb65b1f091bd5d1309aa2d204c5af41573243584751",
      DocumentTitle: {
        Text: ""
      },
      DocumentURI: "",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-de24da9c-32c9-4311-ad96-ae1280229dae",
      Type: "QUESTION_ANSWER",
      Score: 0.5960363745689392
    },
    {
      AdditionalAttributes: [],
      DocumentAttributes: [
        {
          Key: "key",
          Value: {
            StringValue: "1554266747"
          }
        },
        {
          Key: "FileFormat",
          Value: {
            StringValue: "PDF"
          }
        },
        {
          Key: "Version",
          Value: {
            StringValue: "0"
          }
        },
        {
          Key: "key",
          Value: {
            StringValue: "https://example.pdf"
          }
        }
      ],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 19,
            EndOffset: 23,
            TopAnswer: false
          },
          {
            BeginOffset: 52,
            EndOffset: 56,
            TopAnswer: false
          }
        ],
        Text:
          "...Life in ancient Rome revolved around the city of Rome, its famed seven hills, and its monumental architecture  such  as  the  Colosseum,  Trajan's Forum,  and  the  Pantheon.  The  city  also  had..."
      },
      DocumentId: "example.pdf",
      DocumentURI: "https://example.pdf",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-f56d44e7-0fc0-44f0-a468-56c668358e1d",
      Type: "DOCUMENT",
      Score: 0.46950507164001465
    },
    {
      AdditionalAttributes: [],
      DocumentAttributes: [
        {
          Key: "key",
          Value: {
            StringValue: "1554266778"
          }
        },
        {
          Key: "FileFormat",
          Value: {
            StringValue: "PDF"
          }
        },
        {
          Key: "Version",
          Value: {
            StringValue: "0"
          }
        },
        {
          Key: "key",
          Value: {
            StringValue: "https://example.pdf"
          }
        }
      ],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 151,
            EndOffset: 155,
            TopAnswer: false
          }
        ],
        Text:
          "...nation and was accustomed to setbacks. However, the recent string of defeats ending in the calamity at  Arausio was alarming for all  the people of Rome. The defeat  left  them with a critical  shortage of manpower and lost military equipment but also with a terrifying enemy camped on the other side..."
      },
      DocumentId: "example.pdf",
      DocumentURI: "https://example.pdf",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-e5e59e42-c8cf-4ace-9f2f-be4bf61cfeef",
      Type: "DOCUMENT",
      Score: 0.3841032385826111
    },
    {
      AdditionalAttributes: [],
      DocumentAttributes: [
        {
          Key: "key",
          Value: {
            StringValue: "1554266780"
          }
        },
        {
          Key: "FileFormat",
          Value: {
            StringValue: "PDF"
          }
        },
        {
          Key: "Version",
          Value: {
            StringValue: "0"
          }
        },
        {
          Key: "key",
          Value: {
            StringValue: "https://example.pdf"
          }
        }
      ],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 13,
            EndOffset: 17,
            TopAnswer: false
          },
          {
            BeginOffset: 118,
            EndOffset: 122,
            TopAnswer: false
          },
          {
            BeginOffset: 149,
            EndOffset: 153,
            TopAnswer: false
          }
        ],
        Text:
          "...allied to Rome; the Etruscans were not impinging on the Romans, even though the Etruscan town of Veii was close to Rome.  The greatest enemies of Rome at this time were the Volsci and the Aequi. The Volsci were based in territory to the southeast of Rome, while the Aequi were based to the east..."
      },
      DocumentId: "example.pdf",
      DocumentURI: "https://example.pdf",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-c707e7ef-2234-444d-9fb8-2c31d66268ba",
      Type: "DOCUMENT",
      Score: 0.3073580265045166
    },
    {
      AdditionalAttributes: [],
      DocumentAttributes: [
        {
          Key: "key",
          Value: {
            StringValue: "1554266780"
          }
        },
        {
          Key: "FileFormat",
          Value: {
            StringValue: "PDF"
          }
        },
        {
          Key: "Version",
          Value: {
            StringValue: "0"
          }
        },
        {
          Key: "key",
          Value: {
            StringValue: "https://example.pdf"
          }
        }
      ],
      DocumentExcerpt: {
        Highlights: [
          {
            BeginOffset: 13,
            EndOffset: 17,
            TopAnswer: false
          },
          {
            BeginOffset: 118,
            EndOffset: 122,
            TopAnswer: false
          },
          {
            BeginOffset: 149,
            EndOffset: 153,
            TopAnswer: false
          }
        ],
        Text:
          "...allied to Rome; the Etruscans were not impinging on the Romans, even though the Etruscan town of Veii was close to Rome.  The greatest enemies of Rome at this time were the Volsci and the Aequi. The Volsci were based in territory to the southeast of Rome, while the Aequi were based to the east..."
      },
      DocumentId: "example.pdf",
      DocumentURI: "https://example.pdf",
      Id:
        "316827a3-ae5d-4b2d-a436-730243494970-c707e7ef-2234-444d-9fb8-2c31d66268b7",
      Type: "DOCUMENT",
      Score: 0.3073580265045166
    }
  ],
  TotalNumberOfResults: 463
};
