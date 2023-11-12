//import { Table } from "react-bootstrap";
import React from "react";
import {
    Form, SpaceBetween, FormField, FileUpload, Flashbar
} from '@cloudscape-design/components';
import Box from "@cloudscape-design/components/button";
import { presign } from "../api/api";
import axios from "axios";
import {useDropzone} from "react-dropzone";
import {useCallback, useMemo } from 'react';
import Button from "@cloudscape-design/components/button";
import { Header, Container, TokenGroup } from '@cloudscape-design/components';

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
    color: '#bdbdbd',
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
        },
    });

    const onUpload = async (e) => {
        e.preventDefault();
        setUploadStatus(true);

        for (let i = 0; i < items.length; i++) {
            console.log("File uploaded=", items[i].file.name);
            const response = await presign(items[i].file.name);
            const r = await axios.put(response.url, items[i].file);
        }

        setItems((prevState) => []);
        setUploadStatus(false);
        setUploaded(true);
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
                        {uploadStatus ? <Button disabled={true} loading >Uploading</Button> : <Button variant="normal">Upload</Button>}
                    </SpaceBetween>
                }
            >
                <Container
                    header={
                        <Header variant="h2">
                            Upload call recordings
                        </Header>
                    }
                    footer={
                        uploaded ? <div><Flashbar items={successMessage}/></div> : ""
                    }
                >
                    <div className="container">
                        <div {...getRootProps({style})}>
                            <input {...getInputProps()} />
                            {isDragAccept && (<p>Drag and drop or click to select call recordings to upload
                            <br></br>Valid formats: MP3, WAV, FLAC, OGG, AMR, MP4, and WEBM</p>)}
                            {isDragReject && (<p>Unsupported files detected</p>)}
                            {!isDragActive && (<p>Drag and drop or click to select call recordings to upload
                             <br></br>Valid formats: MP3, WAV, FLAC, OGG, AMR, MP4, and WEBM</p>)}
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
