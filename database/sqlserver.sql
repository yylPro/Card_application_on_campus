IF DB_ID(N'CampusService') IS NULL CREATE DATABASE CampusService;
GO
USE CampusService;
GO
IF OBJECT_ID(N'dbo.campus_snapshot', N'U') IS NULL
CREATE TABLE dbo.campus_snapshot (
  id tinyint NOT NULL PRIMARY KEY,
  payload nvarchar(max) NOT NULL,
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
