# Data Manipulation

## Setup

1. Create a `.env.local` file and enter the database credentials as shown below:

   ```env
   DB_NAME=
   DB_USER=
   DB_PASSWORD=
   DB_HOST=
   DB_DIALECT=
   ```

2. Run the following command to install the dependencies:

   ```bash
   npm install
   ```

## Running the Scripts

3. Run the combined script to view both computations, or use individual scripts for specific calculations in `/src` directory:

   - To view both computations:

     ```bash
     node combined.js
     ```

   - To calculate per-student time on task:

     ```bash
     node src/src/perStudent.js
     ```

   - To calculate per-class time on task:
     ```bash
     node src/perClass.js
     ```
