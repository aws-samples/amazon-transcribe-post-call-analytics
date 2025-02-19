//import { Table } from "react-bootstrap";
import React from "react";
import {
    Form, SpaceBetween, FormField, FileUpload, Flashbar, Alert
} from '@cloudscape-design/components';
import Box from "@cloudscape-design/components/button";
import { presign } from "../api/api";
import axios from "axios";
import {useDropzone} from "react-dropzone";
import {useCallback, useMemo } from 'react';
import Button from "@cloudscape-design/components/button";
import { Header, Container, TokenGroup } from '@cloudscape-design/components';
import { useDangerAlert } from "../hooks/useAlert";
import { useTranslation } from 'react-i18next';
import "../locales/i18n";

const baseStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    borderWidth: 3,
    borderRadius: 10,
    borderColor: '#eeeeee',
    borderStyle: 'dashed',
    backgroundColor: '#fafafa',
    color: '#737373',
    outline: 'none',
    transition: 'border .24s ease-in-out'
};

const container = {
    width: '1200px',
    margin: '0rem auto'
};

const focusedStyle = {
    borderColor: '#2196f3'
};

const acceptStyle = {
    borderColor: '#00e676'
};

const rejectStyle = {
    borderColor: '#ff1744'
};

export const Upload = () => {
    const [uploadStatus, setUploadStatus] = React.useState(false);
    const [items, setItems] = React.useState([]);
    const [uploaded, setUploaded] = React.useState(false);
    const [uploadError, setUploadError] = React.useState("");
    const { t } = useTranslation();

    const successMessage = [{
        type: "success",
        content: "Files uploaded successfully.",
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => {setUploaded(false);},
        id: "message_1"
    }];

    const onDrop = useCallback((acceptedFiles, rejectedFiles) => {
        acceptedFiles.forEach((file) => {
            setItems((prevState) => [...prevState, {label: file.name, file: file}]);
        });

    }, []);

    const onDismiss = (itemIndex) => {
        console.log("Label of item:", items[itemIndex]['label']);
        console.log("File of item:", items[itemIndex]['file']);
        setItems([
            ...items.slice(0, itemIndex),
            ...items.slice(itemIndex + 1)
        ]);
    };

    const { getRootProps,
           getInputProps,
           isFocused,
           isDragAccept,
           isDragActive,
           isDragReject
    } = useDropzone({
        onDrop,
        accept: {
            'audio/*': ['.mp3', '.wav', '.flac', '.ogg', '.amr'],
            'video/*': ['.mp4', '.webm'],
        }, validator: file => {
            if (!/^[a-zA-Z0-9._-]+$/.test(file.name)) {
                setUploadError(t("upload.uploadError"));
                return {
                    code: "filename-invalid",
                    message: `Invalid character in file name: ${file.name}`
                };
            }
        },
    });

    const onUpload = async (e) => {
        e.preventDefault();
        setUploadStatus(true);
        try {
            for (let i = 0; i < items.length; i++) {
                console.log("File uploaded=", items[i].file.name);
                const response = await presign(items[i].file.name);
                
                const r = await axios.put(response.url, items[i].file);
            }
            setItems((prevState) => []);
            setUploaded(true);
        } catch (err) {
            setUploadError("An error occurred uploading file(s): " + err.toLocaleString());
        } finally {
            setUploadStatus(false);
        }

    };

    const style = useMemo(() => ({
        ...baseStyle,
        ...(isFocused ? focusedStyle : {}),
        ...(isDragAccept ? acceptStyle : {}),
        ...(isDragReject ? rejectStyle : {})
    }), [
        isFocused,
        isDragAccept,
        isDragReject
    ]);

    return (
        <form onSubmit={(e) => onUpload(e)}>
            <Form
                actions={
                    <SpaceBetween direction='horizontal' size='xs'>
                        {uploadStatus ? <Button disabled={true} loading >{t("upload.uploading")}</Button> : <Button variant="normal">{t("upload.upload")}</Button>}
                    </SpaceBetween>
                }
            >
                <Container
                    header={
                        <Header variant="h2">
                            {t('upload.title')}
                        </Header>
                    }
                    footer={
                        <div>
                            { uploaded ? <div><Flashbar items={successMessage}/></div> : "" }
                            { uploadError !== "" ? <div><Alert dismissible onDismiss={() => {
                                setUploadError("");
                            }} type="error">{uploadError}</Alert></div> : "" }
                        </div>
                    }
                >
                    <div className="container">
                        <div {...getRootProps({style})}>
                            <input {...getInputProps()} />
                            {isDragAccept && (<p>{t('upload.dragAccept')}
                            <br></br>{t("upload.dragFormat")}</p>)}
                            {isDragReject && (<p>Unsupported files detected</p>)}
                            {!isDragActive && (<p>{t('upload.dragAccept')}
                             <br></br>{t("upload.dragFormat")}</p>)}
                        </div>
                    </div>
                    <aside>
                        <TokenGroup
                            onDismiss={(e) => onDismiss(e.detail.itemIndex)}
                            items={items}
                        />
                    </aside>
                </Container>
            </Form>
        </form>
    );
};
