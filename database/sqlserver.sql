/*
  Local SQL Server example. Run the CREATE DATABASE block from master.
  Change the D: paths if the SQL Server service account cannot write there.
*/
IF DB_ID(N'CampusService') IS NULL
BEGIN
  CREATE DATABASE [CampusService]
  ON PRIMARY
  (
    NAME = N'CampusService',
    FILENAME = N'D:\CampusServiceData\CampusService.mdf',
    SIZE = 64MB,
    FILEGROWTH = 32MB
  )
  LOG ON
  (
    NAME = N'CampusService_log',
    FILENAME = N'D:\CampusServiceData\CampusService_log.ldf',
    SIZE = 32MB,
    FILEGROWTH = 16MB
  );
END;
GO
USE [CampusService];
GO
IF OBJECT_ID(N'dbo.campus_snapshot', N'U') IS NULL
CREATE TABLE dbo.campus_snapshot (
  id tinyint NOT NULL PRIMARY KEY,
  payload nvarchar(max) NOT NULL,
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
