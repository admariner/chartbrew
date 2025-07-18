import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { useDispatch, useSelector } from "react-redux";
import {
  Badge,
  Button, Checkbox, Divider, Input, Link, Modal, ModalBody, ModalContent,
  ModalFooter, ModalHeader, Popover, PopoverContent, PopoverTrigger, Spacer,
  Tab, Tabs, Tooltip, Drawer, DrawerHeader, DrawerBody, DrawerFooter, 
  DrawerContent, Code, Switch, Select, SelectItem,
} from "@heroui/react";
import AceEditor from "react-ace";
import toast from "react-hot-toast";
import { LuCheck, LuChevronRight, LuInfo, LuPlay, LuPlus, LuTrash, LuChevronsRight } from "react-icons/lu";
import { useParams } from "react-router";

import "ace-builds/src-min-noconflict/mode-javascript";
import "ace-builds/src-min-noconflict/theme-tomorrow";
import "ace-builds/src-min-noconflict/theme-one_dark";

import { createSavedQuery, updateSavedQuery } from "../../../slices/savedQuery";
import { createVariableBinding, runDataRequest, selectDataRequests, updateVariableBinding } from "../../../slices/dataset";
import SavedQueries from "../../../components/SavedQueries";
import Container from "../../../components/Container";
import Row from "../../../components/Row";
import Text from "../../../components/Text";
import { useTheme } from "../../../modules/ThemeContext";
import QueryResultsTable from "./QueryResultsTable";
import AiQuery from "../../Dataset/AiQuery";
import DataTransform from "../../Dataset/DataTransform";
import SqlAceEditor from "../../../components/SqlAceEditor";

/*
  MongoDB query builder with variable support
*/
function MongoQueryBuilder(props) {
  const {
    onChangeRequest, onSave, dataRequest, connection, onDelete,
  } = props;

  const [savedQuery, setSavedQuery] = useState(null);
  const [saveQueryModal, setSaveQueryModal] = useState(false);
  const [savedQuerySummary, setSavedQuerySummary] = useState("");
  const [updatingSavedQuery, setUpdatingSavedQuery] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [testError, setTestError] = useState("");
  const [testingQuery, setTestingQuery] = useState(false);
  const [result, setResult] = useState("");
  const [mongoRequest, setMongoRequest] = useState({
    query: "collection('your_collection').find({status: {{status}}}).limit(100)",
  });
  const [invalidateCache, setInvalidateCache] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [activeResultsTab, setActiveResultsTab] = useState("table");
  const [showTransform, setShowTransform] = useState(false);
  const [variableSettings, setVariableSettings] = useState(null);
  const [variableLoading, setVariableLoading] = useState(false);

  const { isDark } = useTheme();
  const params = useParams();
  const dispatch = useDispatch();
  const stateDrs = useSelector((state) => selectDataRequests(state, params.datasetId));

  useEffect(() => {
    if (dataRequest) {
      const newRequest = { ...mongoRequest, ...dataRequest };
      if (!dataRequest.query) newRequest.query = mongoRequest.query;
      setMongoRequest(newRequest);
    }
  }, []);

  useEffect(() => {
    onChangeRequest(mongoRequest);
  }, [mongoRequest]);

  useEffect(() => {
    if (stateDrs && stateDrs.length > 0) {
      const selectedResponse = stateDrs.find((o) => o.id === mongoRequest.id);
      if (selectedResponse?.response) {
        setResult(JSON.stringify(selectedResponse.response, null, 2));
      }
    }
  }, [stateDrs, mongoRequest]);

  const _onSaveQueryConfirmation = () => {
    setSaveQueryModal(true);
  };

  const _onSaveQuery = () => {
    setSavingQuery(true);
    dispatch(createSavedQuery({
      team_id: params.teamId,
      data: {
        query: mongoRequest.query,
        summary: savedQuerySummary,
        type: "mongodb",
      }
    }))
      .then((savedQuery) => {
        setSavingQuery(false);
        setSavedQuery(savedQuery.id);
        toast.success("The query was saved 👍");
        setSaveQueryModal(false);
      })
      .catch(() => {
        setSavingQuery(false);
        toast.error("We couldn't save the query. Please try again 😿");
        setSaveQueryModal(false);
      });
  };

  const _onUpdateSavedQuery = () => {
    setUpdatingSavedQuery(true);

    dispatch(updateSavedQuery({
      team_id: params.teamId,
      data: {
        ...savedQuery,
        query: mongoRequest.query
      },
    }))
      .then(() => {
        setUpdatingSavedQuery(false);
        toast.success("The query was updated 👍");
      })
      .catch(() => {
        setUpdatingSavedQuery(false);
        toast.error("We couldn't update your query. Please try again 😿");
      });
  };

  const _onChangeQuery = (value) => {
    setTestSuccess(false);
    setTestError(false);
    setMongoRequest({ ...mongoRequest, query: value });
  };

  const _onTest = (dr = mongoRequest) => {
    setTestingQuery(true);
    setTestSuccess(false);
    setTestError(false);

    onSave(dr).then(() => {
      const getCache = !invalidateCache;
      dispatch(runDataRequest({
        team_id: params.teamId,
        dataset_id: dr.dataset_id,
        dataRequest_id: dr.id,
        getCache
      }))
        .then((data) => {
          if (data?.error) {
            setTestingQuery(false);
            setTestError(data.error);
            setResult(JSON.stringify(data.error, null, 2));
            toast.error("The request failed. Please check your query 🕵️‍♂️");
            return;
          }

          const result = data.payload;
          if (result?.status?.statusCode >= 400) {
            setTestError(result.response);
          }
          if (result?.response?.dataRequest?.responseData?.data) {
            setResult(JSON.stringify(result.response.dataRequest.responseData.data, null, 2));
            setTestSuccess(true);
          }
          setTestingQuery(false);
        })
        .catch((error) => {
          setTestingQuery(false);
          setTestError(error);
          setResult(error);
          toast.error("The request failed. Please check your query 🕵️‍♂️");
        });
    });
  };

  const _onSavePressed = () => {
    setSaveLoading(true);
    onSave(mongoRequest).then(() => {
      setSaveLoading(false);
    }).catch(() => {
      setSaveLoading(false);
    });
  };

  const _onTransformSave = (transformConfig) => {
    const updatedRequest = { ...mongoRequest, transform: transformConfig };
    setMongoRequest(updatedRequest);
    onSave(updatedRequest);
  };

  const _onVariableClick = (variable) => {
    let selectedVariable = mongoRequest.VariableBindings?.find((v) => v.name === variable.variable);
    if (selectedVariable) {
      setVariableSettings(selectedVariable);
    } else {
      setVariableSettings({
        name: variable.variable,
        type: "string",
        value: "",
      });
    }
  };

  const _onVariableSave = async () => {
    setVariableLoading(true);
    try {
      let response;
      if (variableSettings.id) {
        response = await dispatch(updateVariableBinding({
          team_id: params.teamId,
          dataset_id: dataRequest.dataset_id,
          dataRequest_id: dataRequest.id,
          variable_id: variableSettings.id,
          data: variableSettings,
        }));
      } else {
        response = await dispatch(createVariableBinding({
          team_id: params.teamId,
          dataset_id: dataRequest.dataset_id,
          dataRequest_id: dataRequest.id,
          data: variableSettings,
        }));
      }

      // Use the updated dataRequest from the API response, but preserve the current query
      if (response.payload) {
        setMongoRequest({
          ...mongoRequest,
          ...response.payload,
          query: mongoRequest.query, // Preserve the current query being edited
        });
      }

      setVariableLoading(false);
      setVariableSettings(null);
      toast.success("Variable saved successfully");
    } catch (error) {
      setVariableLoading(false);
      toast.error("Failed to save variable");
    }
  };

  return (
    <div style={styles.container} className="pl-1 pr-1 md:pl-4 md:pr-4">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6">
          <Row justify="space-between" align="center">
            <Text b size={"lg"}>{connection.name}</Text>
            <div className="flex flex-row items-center gap-2">
              <Button
                color="primary"
                auto
                size="sm"
                onPress={() => _onSavePressed()}
                isLoading={saveLoading || testingQuery}
              >
                {"Save"}
              </Button>
              <Badge color="success" content="" placement="top-right" shape="circle" isInvisible={!mongoRequest.transform?.enabled}>
                <Button
                  color="primary"
                  variant="flat"
                  size="sm"
                  onPress={() => setShowTransform(true)}
                >
                  Transform
                </Button>
              </Badge>
              <Tooltip content="Delete this data request" placement="bottom" css={{ zIndex: 99999 }}>
                <Button
                  color="danger"
                  isIconOnly
                  auto
                  size="sm"
                  variant="bordered"
                  onPress={() => onDelete()}
                >
                  <LuTrash />
                </Button>
              </Tooltip>
            </div>
          </Row>
          <Spacer y={2} />
          <Row>
            <Divider />
          </Row>
          <Spacer y={4} />
          <Row align="center">
            <Text b>
              {"Enter your mongodb query here"}
            </Text>
            <Spacer x={0.5} />
            <Tooltip
              content={(
                <>
                  <Text>
                    {"In order to select a collection you always have to start with "}
                  </Text>
                  <pre>{"collection('collection_name')"}</pre>
                  <Text size="sm">
                    {"You can use variables like {{variable_name}} in your queries"}
                  </Text>
                </>
              )}
              placement="bottom"
            >
              <div><LuInfo /></div>
            </Tooltip>
          </Row>
          <Spacer y={1} />
          <Row>
            <SqlAceEditor
              mode="javascript"
              theme={isDark ? "one_dark" : "tomorrow"}
              height="300px"
              width="none"
              value={mongoRequest.query || ""}
              onChange={(value) => {
                _onChangeQuery(value);
              }}
              onVariableClick={_onVariableClick}
              name="queryEditor"
              className="mongobuilder-query-tut"
            />
          </Row>
          <Spacer y={2} />
          <div className="mongobuilder-buttons-tut flex flex-row items-center">
            <Button
              color={testSuccess ? "success" : testError ? "danger" : "primary"}
              endContent={<LuPlay />}
              onPress={() => _onTest()}
              isLoading={testingQuery}
              fullWidth
            >
              Run query
            </Button>
          </div>
          <Spacer y={2} />
          <div className="flex flex-row items-center">
            <Checkbox
              isSelected={!invalidateCache}
              onChange={() => setInvalidateCache(!invalidateCache)}
              size="sm"
            >
              {"Use cached data"}
            </Checkbox>
            <Spacer x={1} />
            <Tooltip
              content={"Chartbrew will use cached data for extra editing speed ⚡️. The cache gets automatically invalidated when you change the query."}
              className="max-w-[400px]"
            >
              <div><LuInfo /></div>
            </Tooltip>
          </div>

          <div className="flex flex-col gap-2">
            <AiQuery
              query={mongoRequest.query}
              dataRequest={dataRequest}
              onChangeQuery={_onChangeQuery}
              connectionType="mongodb"
            />
          </div>

          <Spacer y={4} />
          <Divider />
          <Spacer y={4} />
          <Row>
            <Text b>Saved queries</Text>
          </Row>
          <Spacer y={2} />
          <div className="flex flex-row gap-2">
            <Button
              endContent={<LuPlus />}
              isLoading={savingQuery}
              onPress={_onSaveQueryConfirmation}
              variant="flat"
              size="sm"
            >
              {!savedQuery && "Save this query"}
              {savedQuery && "Save as new"}
            </Button>

            {savedQuery && (
              <>
                <Button
                  variant="flat"
                  endContent={<LuCheck />}
                  onPress={_onUpdateSavedQuery}
                  isLoading={updatingSavedQuery}
                  size="sm"
                >
                  {"Update current query"}
                </Button>
              </>
            )}
          </div>
          <Spacer y={2} />
          <Row className="mongobuilder-saved-tut">
            <SavedQueries
              selectedQuery={savedQuery}
              onSelectQuery={(savedQuery) => {
                setSavedQuery(savedQuery.id);
                _onChangeQuery(savedQuery.query);
              }}
              type="mongodb"
              style={styles.savedQueriesContainer}
            />
          </Row>
          <Spacer y={8} />
        </div>
        <div className="col-span-12 sm:col-span-6">
          <Tabs variant="light" selectedKey={activeResultsTab} onSelectionChange={(key) => setActiveResultsTab(key)}>
            <Tab title="Table" key="table" />
            <Tab title="JSON" key="json" />
          </Tabs>
          <Spacer y={2} />

          {activeResultsTab === "json" && (
            <div className="w-full">
              <AceEditor
                mode="json"
                theme={isDark ? "one_dark" : "tomorrow"}
                height="450px"
                width="none"
                value={testError || result || ""}
                name="resultEditor"
                readOnly
                editorProps={{ $blockScrolling: false }}
                className="mongobuilder-result-tut rounded-md border-1 border-solid border-content3"
              />
            </div>
          )}

          {activeResultsTab === "table" && (
            <div className="w-full">
              <QueryResultsTable result={result} />
            </div>
          )}

          <Spacer y={1} />
          {result && (
            <>
              <Row>
                <Text size="sm">This is a sample response and might not show all the data.</Text>
              </Row>
              <Spacer y={1} />
            </>
          )}

          <Row>
            <Popover>
              <PopoverTrigger>
                <Link className="text-secondary flex items-center cursor-pointer">
                  <div className="flex flex-row items-center gap-1">
                    <div className="text-sm text-default-500">Are your queries slow? Read here</div>
                    <LuInfo className="text-default-500" />
                  </div>
                </Link>
              </PopoverTrigger>
              <PopoverContent className="max-w-[600px] p-10">
                <Container className={"w-full"}>
                  <Row>
                    <Text>{"You can use the following methods to optimize your queries and make them significantly smaller in size."}</Text>
                  </Row>
                  <Spacer y={2} />
                  <Row>
                    <Link
                      href="https://docs.mongodb.com/manual/reference/operator/query-comparison/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start"
                    >
                      <div><LuChevronRight /></div>
                      <Spacer x={0.5} />
                      <Text color="primary">
                        {"Use a relevant condition for your query. For example, don't fetch all the documents if you know you are going to use just the recent ones."}
                      </Text>
                    </Link>
                  </Row>
                  <Spacer y={1} />
                  <Row>
                    <Link
                      as="a"
                      href="https://docs.mongodb.com/manual/tutorial/project-fields-from-query-results/#return-the-specified-fields-and-the-id-field-only"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start"
                    >
                      <div><LuChevronRight /></div>
                      <Spacer x={0.2} />
                      <Text color="primary">
                        {"Remove unwanted fields from the query payload if you know for sure that they won't help to generate the chart you have in mind."}
                      </Text>
                    </Link>
                  </Row>
                  <Spacer y={1} />
                  <Row>
                    <Link
                      as="a"
                      href="https://docs.mongodb.com/manual/tutorial/project-fields-from-query-results/#return-the-specified-fields-and-the-id-field-only"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start"
                    >
                      <div><LuChevronRight /></div>
                      <Spacer x={1} />
                      <Text color="primary">
                        {"If you store files encoded in base64, make sure you exclude them using the method above"}
                      </Text>
                    </Link>
                  </Row>
                </Container>
              </PopoverContent>
            </Popover>
          </Row>
        </div>
      </div>

      {/* Save query modal */}
      <Modal isOpen={saveQueryModal} size="small" onClose={() => setSaveQueryModal(false)}>
        <ModalContent>
          <ModalHeader>
            <Text b>{"Save your query and use it later in this project"}</Text>
          </ModalHeader>
          <ModalBody>
            <Input
              label="Write a short description for your query"
              placeholder="Type a summary here"
              fullWidth
              onChange={(e) => setSavedQuerySummary(e.target.value)}
              size="lg"
              variant="bordered"
            />
          </ModalBody>
          <ModalFooter>
            <Button
              variant="bordered"
              onPress={() => setSaveQueryModal(false)}
            >
              Close
            </Button>
            <Button
              disabled={!savedQuerySummary}
              endContent={<LuCheck />}
              onPress={_onSaveQuery}
              color="primary"
            >
              Save the query
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <DataTransform
        isOpen={showTransform}
        onClose={() => setShowTransform(false)}
        onSave={_onTransformSave}
        initialTransform={mongoRequest.transform}
      />

      <Drawer
        isOpen={!!variableSettings}
        onClose={() => setVariableSettings(null)}
        placement="right"
        classNames={{
          base: "sm:data-[placement=right]:m-2 sm:data-[placement=left]:m-2 rounded-medium",
        }}
        style={{
          marginTop: "54px",
        }}
        backdrop="transparent"
      >
        <DrawerContent>
          <DrawerHeader
            className="flex flex-row items-center border-b-1 border-divider gap-2 px-2 py-2 justify-between bg-content1/50 backdrop-saturate-150 backdrop-blur-lg"
          >
            <Tooltip content="Close">
              <Button
                isIconOnly
                onPress={() => setVariableSettings(null)}
                size="sm"
                variant="light"
              >
                <LuChevronsRight />
              </Button>
            </Tooltip>
            <div className="text-sm font-bold">Variable settings</div>
            <div className="flex flex-row items-center gap-2">
              <Code color="primary" radius="sm" variant="flat" className="text-sm">
                {variableSettings?.name}
              </Code>
            </div>
          </DrawerHeader>
          <DrawerBody>
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold text-gray-500">Variable name</div>
              <pre className="text-primary">
                {variableSettings?.name}
              </pre>
            </div>
            <Spacer y={1} />
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold text-gray-500">Variable type</div>
              <Select
                label="Select a type"
                placeholder="Select a variable type"
                fullWidth
                selectedKeys={[variableSettings?.type]}
                onSelectionChange={(keys) => setVariableSettings({ ...variableSettings, type: keys.currentKey })}
                variant="bordered"
              >
                <SelectItem key="string">String</SelectItem>
                <SelectItem key="number">Number</SelectItem>
                <SelectItem key="boolean">Boolean</SelectItem>
                <SelectItem key="date">Date</SelectItem>
              </Select>
            </div>
            <Spacer y={1} />
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold text-gray-500">Default value</div>
              <Input
                placeholder="Type a value here"
                fullWidth
                variant="bordered"
                value={variableSettings?.default_value}
                onChange={(e) => setVariableSettings({ ...variableSettings, default_value: e.target.value })}
                description={variableSettings?.required && !variableSettings?.default_value && "This variable is required. The query will fail if you don't provide a value."}
              />
            </div>
            <Spacer y={1} />
            <div className="flex flex-col gap-2">
              <div className="text-sm font-bold text-gray-500">Required</div>
              <Switch
                isSelected={variableSettings?.required}
                onValueChange={(selected) => setVariableSettings({ ...variableSettings, required: selected })}
                size="sm"
              />
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button
              variant="flat"
              onPress={() => setVariableSettings(null)}
            >
              Close
            </Button>
            <Button
              color="primary"
              onPress={_onVariableSave}
              isLoading={variableLoading}
            >
              Save
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
  },
  savedQueriesContainer: {
    maxHeight: 170,
    overflow: "auto",
  },
};

MongoQueryBuilder.propTypes = {
  dataRequest: PropTypes.object.isRequired,
  onChangeRequest: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  match: PropTypes.object.isRequired,
  connection: PropTypes.object.isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default MongoQueryBuilder;
