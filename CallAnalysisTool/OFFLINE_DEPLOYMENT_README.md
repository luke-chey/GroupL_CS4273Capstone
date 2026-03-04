# Offline Deployment Setup Guide

This guide explains how to import prebuilt Docker images and volumes,
then start the application in offline mode.

------------------------------------------------------------------------

## Prerequisites

-   Docker Desktop installed and running
-   The project directory containing:
    -   `backend/data/`
        -   Contains the question list `EMSQA.csv`
    -   `offline_backup/`
        -   Contains all exported images (`callanalysistool-*-latest.tar.gz`)
        -   Contains all exported volumes (`callanalysistool_*.tar.gz`)
    -   `import_all.sh`
    -   `docker-compose.yml`
- **No other source code required**

Path on server as of writing:\
C:/ou_transfer/

------------------------------------------------------------------------

## Step 1 - Import Docker Images

1.  Navigate to the main project directory.

2.  Open **Git Bash** in that directory.\
    The import script may not work correctly in other shells.

3.  Run:

    ``` bash
    ./import_all.sh
    # Or, if that doesn't work
    sh import_all.sh
    ```

4.  When prompted, choose to install **IMAGES ONLY**.

Do not install volumes yet. Volumes depend on the images (specifically
`ubuntu`) being present.

------------------------------------------------------------------------

## Step 2 - Import Docker Volumes

1.  Close Git Bash completely.

2.  Reopen Git Bash in the same directory.

3.  Run:

    ``` bash
    ./import_all.sh
    # Or, if that doesn't work
    sh import_all.sh
    ```

4.  When prompted, choose to install **VOLUMES ONLY**.

------------------------------------------------------------------------

## Step 3 - Verify Images and Volumes

In Docker Desktop:

-   Confirm all required images are present.
-   Confirm all required volumes are present and non-empty.

------------------------------------------------------------------------

## Step 4 - Configure docker-compose.yml

1.  Open `docker-compose.yml`.
2.  Scroll to the bottom where the `volumes:` definitions are located.
3.  Ensure:
    -   Only the offline deployment `volumes:` block is uncommented.
    -   The `name:` values match the volume names shown in Docker
        Desktop exactly.

If they do not match, update the `name:` values to match Docker Desktop.

------------------------------------------------------------------------

## Step 5 - Start the Application

1.  Open the terminal inside Docker Desktop.

2.  Navigate to the directory containing `docker-compose.yml`.

3.  Run:

    ``` bash
    docker compose up
    ```

The containers should attach to the imported images and volumes, and the
application should start.

------------------------------------------------------------------------

## Accessing the Web Application

Open a browser and go to:

http://localhost:3000

The application should now be running fully offline.

*- Luke Chey, 2/26/26*
